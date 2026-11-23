import { useMemo, useRef, useState } from 'react'
import { CardState, deleteWord, needsDefinition, updateWordInfo, updateWordNote } from '../db'
import { lookup } from '../services/translate'
import { getSettings, modeLabel, useSettings } from '../settings'
import { formatInterval, isFamiliar } from '../srs'
import { isLikelyFragment, splitContext } from '../utils/text'

const STATE_LABEL = {
  [CardState.New]: '新词',
  [CardState.Learning]: '学习中',
  [CardState.Review]: '复习',
  [CardState.Relearning]: '重新学习',
}

const FILTERS = [
  { id: 'all', label: '全部', test: () => true },
  { id: 'new', label: '新词', test: (w) => w.state === CardState.New },
  { id: 'learning', label: '学习中', test: (w) => w.state === CardState.Learning || w.state === CardState.Relearning },
  { id: 'review', label: '复习', test: (w) => w.state === CardState.Review },
  { id: 'due', label: '已到期', test: (w, now) => Date.parse(w.due) <= now },
  { id: 'nodef', label: '缺释义', test: (w) => needsDefinition(w) },
  { id: 'note', label: '有笔记', test: (w) => !!w.note?.trim() },
  { id: 'familiar', label: '已熟悉', test: (w) => isFamiliar(w) },
  { id: 'fragment', label: '疑似残缺', test: (w) => isLikelyFragment(w.word, w.context) },
]

const SORTS = [
  { id: 'recent', label: '最近添加', fn: (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') },
  { id: 'alpha', label: '字母顺序', fn: (a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }) },
  { id: 'due', label: '下次复习', fn: (a, b) => (a.due ?? '').localeCompare(b.due ?? '') },
]

const PAUSE_MS = 300 // 批量查询时每个词之间稍微停一下，避免请求过快被限流

function Badge({ children, tone = 'stone' }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-500',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-600',
  }
  return <span className={`rounded px-1.5 py-px text-[11px] ${tones[tone]}`}>{children}</span>
}

/** 词汇库里编辑笔记 */
function NoteEditor({ w }) {
  const [draft, setDraft] = useState(w.note ?? '')
  const dirty = draft.trim() !== (w.note ?? '').trim()
  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="笔记：在这里的意思、例句、联想……"
        className="w-full resize-none rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-base leading-relaxed text-stone-700 outline-none focus:border-stone-400 sm:text-sm"
      />
      {dirty && (
        <button type="button" onClick={() => updateWordNote(w.id, draft)} className="mt-1 rounded-md bg-ink px-3 py-1 text-xs text-white hover:bg-stone-700">
          保存笔记
        </button>
      )}
    </div>
  )
}

function WordRow({ w, now, expanded, onToggle, onRequery, onDelete, busy }) {
  const fragment = isLikelyFragment(w.word, w.context)
  const noDef = needsDefinition(w)
  const due = Date.parse(w.due)
  const parts = expanded ? splitContext(w.context, w.word) : null

  return (
    <li className="py-3.5">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-serif text-lg font-semibold break-words text-stone-900">{w.word}</span>
            {w.phonetic && <span className="font-mono text-xs text-stone-400">{w.phonetic}</span>}
            <Badge>{STATE_LABEL[w.state] ?? '新词'}</Badge>
            {fragment && <Badge tone="rose">疑似残缺</Badge>}
            {noDef && <Badge tone="amber">缺释义</Badge>}
            {isFamiliar(w) && <Badge>已熟悉 · 不高亮</Badge>}
          </div>
          {!expanded && (
            <p className="mt-0.5 truncate text-sm text-stone-500">
              {noDef ? '（没有释义）' : w.translation.split('\n')[0]}
            </p>
          )}
          {!expanded && w.note && <p className="mt-0.5 truncate text-xs text-stone-400">📝 {w.note}</p>}
        </div>
        <span className={`shrink-0 pt-1 text-xs ${due <= now ? 'text-amber-600' : 'text-stone-400'}`}>
          {due <= now ? '已到期' : `${formatInterval(due - now)}后`}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2.5 rounded-lg bg-stone-50 p-3.5 text-sm">
          <p className="leading-relaxed whitespace-pre-line text-stone-700">
            {w.pos && <span className="mr-1.5 text-xs text-stone-400">{w.pos}</span>}
            {noDef ? '（没有释义）' : w.translation}
          </p>
          {w.etymology && <p className="text-xs text-stone-500">词根：{w.etymology}</p>}
          <NoteEditor w={w} />
          {w.context && (
            <p className="font-serif leading-relaxed text-stone-600">
              {parts ? (
                <>
                  {parts[0]}
                  <mark className="hl-new">{parts[1]}</mark>
                  {parts[2]}
                </>
              ) : (
                w.context
              )}
            </p>
          )}
          {fragment && (
            <p className="text-xs text-rose-600">
              原句里没有完整的「{w.word}」，可能是只选中了半个词时标记的。建议删除后在阅读页重新标记完整的单词。
            </p>
          )}
          <p className="text-xs text-stone-400">
            {w.source && `出自《${w.source}》 · `}
            添加于 {new Date(w.createdAt).toLocaleDateString()} · 复习 {w.repetition ?? 0} 次 · 遗忘 {w.lapses ?? 0} 次
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onRequery}
              className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-40"
            >
              重新查询释义
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md px-3 py-1.5 text-xs text-stone-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              删除
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function VocabPage({ words }) {
  const settings = useSettings()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('recent')
  const [expanded, setExpanded] = useState(null)
  const [job, setJob] = useState(null) // 批量补全：{ running, done, total, failed, message }
  const [rowBusy, setRowBusy] = useState(null)
  const cancelRef = useRef(false)
  // 进入页面时取一次当前时间，用来显示“已到期 / x 天后”（列表不需要每秒刷新）
  const [now] = useState(() => Date.now())

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, words.filter((w) => f.test(w, now)).length])), [words, now])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const test = FILTERS.find((f) => f.id === filter).test
    return words
      .filter((w) => test(w, now))
      .filter((w) => !q || [w.word, w.translation, w.context, w.note].some((s) => s?.toLowerCase().includes(q)))
      .sort(SORTS.find((s) => s.id === sort).fn)
  }, [words, query, filter, sort, now])

  const requery = async (w) => {
    const data = await lookup(w.word, w.context, getSettings())
    await updateWordInfo(w.id, data)
  }

  const handleRequery = async (w) => {
    setRowBusy(w.id)
    try {
      await requery(w)
    } catch (err) {
      window.alert(`查询失败：${err.message}`)
    } finally {
      setRowBusy(null)
    }
  }

  const handleDelete = async (w) => {
    if (!window.confirm(`删除「${w.word}」？它的复习进度也会一起删除。`)) return
    await deleteWord(w.id)
    setExpanded(null)
  }

  // 批量补全：用当前查词模式，逐个重新查询“缺释义”的词
  const targets = words.filter(needsDefinition)
  const startBulk = async () => {
    const source = modeLabel(settings)
    const costNote = settings.mode === 'ai' ? `\n\n当前是 AI 模式（${source}），每个词会调用一次 API，按用量计费。` : ''
    if (!window.confirm(`用「${source}」重新查询 ${targets.length} 个词的释义？${costNote}`)) return
    cancelRef.current = false
    let done = 0
    let failed = 0
    setJob({ running: true, done, total: targets.length, failed })
    for (const w of targets) {
      if (cancelRef.current) break
      try {
        await requery(w)
      } catch {
        failed++
      }
      done++
      setJob({ running: true, done, total: targets.length, failed })
      await new Promise((r) => setTimeout(r, PAUSE_MS))
    }
    setJob({
      running: false,
      done,
      total: targets.length,
      failed,
      message: `${cancelRef.current ? '已停止' : '完成'}：更新了 ${done - failed} 个${failed ? `，${failed} 个查询失败（可以稍后再试或换个查词模式）` : ''}`,
    })
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pt-10 pb-32 sm:px-6 sm:pt-16">
      <p className="text-xs font-medium tracking-widest text-stone-400 uppercase">Vocabulary</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900">词汇库</h1>
        <p className="pb-1 text-sm text-stone-400">共 {words.length} 个</p>
      </div>

      {/* 批量补全释义 */}
      {(targets.length > 0 || job) && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
          {job?.running ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-amber-800">
                正在补全释义… {job.done} / {job.total}
              </span>
              <button type="button" onClick={() => (cancelRef.current = true)} className="text-xs text-amber-700 underline">
                停止
              </button>
            </div>
          ) : (
            <>
              {job?.message && <p className="mb-2 text-amber-800">{job.message}</p>}
              {targets.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-amber-800">
                    有 {targets.length} 个词没有释义（或还是早期的演示数据）
                  </span>
                  <button
                    type="button"
                    onClick={startBulk}
                    className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700"
                  >
                    用「{modeLabel(settings)}」补全释义
                  </button>
                </div>
              )}
            </>
          )}
          {job?.running && (
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-amber-100">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(job.done / job.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {/* 搜索 / 筛选 / 排序 */}
      <div className="mt-6 flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索单词、释义、原句或笔记"
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-base outline-none focus:border-stone-400 sm:text-sm"
        />
        <select
          aria-label="排序"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white px-2 py-2 text-base text-stone-600 sm:text-sm"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) =>
          f.id === 'all' || counts[f.id] > 0 ? (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === f.id ? 'border-ink bg-ink text-white' : 'border-stone-200 text-stone-500 hover:bg-stone-100'
              }`}
            >
              {f.label} {counts[f.id]}
            </button>
          ) : null,
        )}
      </div>

      {words.length === 0 ? (
        <p className="mt-16 text-center text-sm text-stone-400">
          还没有生词。在阅读页划选单词，点「Mark 标记生词」后就会出现在这里。
        </p>
      ) : list.length === 0 ? (
        <p className="mt-16 text-center text-sm text-stone-400">没有符合条件的词</p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-200/70 border-y border-stone-200/70">
          {list.map((w) => (
            <WordRow
              key={w.id}
              w={w}
              now={now}
              expanded={expanded === w.id}
              busy={rowBusy === w.id || !!job?.running}
              onToggle={() => setExpanded((id) => (id === w.id ? null : w.id))}
              onRequery={() => handleRequery(w)}
              onDelete={() => handleDelete(w)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
