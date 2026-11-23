import { useCallback, useEffect, useRef, useState } from 'react'
import { CardState, db, getDueWords, saveReview, updateWordNote } from '../db'
import { useNow } from '../hooks/useNow'
import { formatInterval, fromCard, grade, GRADES, LEARN_AHEAD_MS, previewNext, toCard } from '../srs'
import { splitContext } from '../utils/text'

const STATE_LABEL = {
  [CardState.New]: '新词',
  [CardState.Learning]: '学习中',
  [CardState.Review]: '复习',
  [CardState.Relearning]: '重新学习',
}

// Tailwind 只识别完整的类名字符串，所以按钮配色写成静态映射
const TONE = {
  rose: 'text-rose-700 hover:border-rose-300 hover:bg-rose-50',
  amber: 'text-amber-700 hover:border-amber-300 hover:bg-amber-50',
  emerald: 'text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50',
}

function Kbd({ children }) {
  return (
    <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-sans text-[10px] text-stone-400 pointer-coarse:hidden">
      {children}
    </kbd>
  )
}

// 打开输入框时把光标放到末尾（只在刚挂载时做一次）
const caretToEnd = (el) => {
  if (!el || el.dataset.focused) return
  el.dataset.focused = '1'
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
}

/**
 * 卡片背面的笔记：没有笔记时「添加笔记」，有笔记时显示「我的笔记」+「编辑」。
 * 编辑中：保存 / 取消。没点保存就评分、翻到下一张（卡片卸载）时自动保存，不会丢
 */
function ReviewNote({ word, onSaveNote }) {
  const note = word.note ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  const dirty = editing && draft.trim() !== note.trim()

  // 卸载时如果还有没保存的修改，自动保存
  const pending = useRef(null)
  useEffect(() => {
    pending.current = dirty ? draft : null
  })
  useEffect(() => () => pending.current !== null && onSaveNote(pending.current), [onSaveNote])

  const save = () => {
    if (dirty) onSaveNote(draft)
    pending.current = null
    setEditing(false)
  }
  const cancel = () => {
    setDraft(note)
    setEditing(false)
  }
  const small = 'rounded-md px-2.5 py-1 text-xs transition-colors'

  if (editing) {
    return (
      <div className="mt-4">
        <textarea
          ref={caretToEnd}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="在这里的意思、例句、联想……"
          className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-base leading-relaxed text-stone-700 outline-none focus:border-amber-400 sm:text-sm"
        />
        <div className="mt-1.5 flex justify-end gap-2">
          <button type="button" onClick={cancel} className={`${small} text-stone-500 hover:bg-stone-100`}>
            取消
          </button>
          <button type="button" onClick={save} disabled={!dirty} className={`${small} bg-ink text-white hover:bg-stone-700 disabled:opacity-40`}>
            保存
          </button>
        </div>
      </div>
    )
  }
  if (!note) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="mt-4 rounded-lg px-2 py-1 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800">
        📝 添加笔记
      </button>
    )
  }
  return (
    // 自己写的笔记：往往比词典释义更能帮你回忆起来
    <div className="mt-4 rounded-lg bg-amber-50/70 px-4 py-3 text-sm leading-relaxed text-stone-700">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-amber-700">📝 我的笔记</span>
        <button type="button" onClick={() => setEditing(true)} className={`${small} -my-1 text-amber-700 hover:bg-amber-100`}>
          编辑
        </button>
      </div>
      <p className="whitespace-pre-line">{note}</p>
    </div>
  )
}

function ReviewCard({ word, revealedAt, onReveal, onRate, onSaveNote, onBack }) {
  const parts = splitContext(word.context, word.word)
  const revealed = revealedAt !== null
  // 以“翻开答案的时刻”为基准预览各评分的下次复习时间
  const previews = revealed ? previewNext(word, new Date(revealedAt)) : null

  return (
    <div
      // 还没翻开时，点卡片任意位置都能翻开（手机上更顺手）
      onClick={revealed ? undefined : onReveal}
      className={`animate-pop rounded-2xl border border-stone-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-10 ${
        revealed ? '' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-center justify-between text-[11px] tracking-wide text-stone-400">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-500">
          {STATE_LABEL[word.state] ?? '新词'}
        </span>
        <span>看英文，回想中文意思</span>
      </div>

      {/* ===== 正面：英文单词 + 所在原句（单词在句中高亮，借助语境回想意思） ===== */}
      {parts ? (
        <>
          <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-serif text-3xl font-semibold tracking-tight break-words text-stone-900 sm:text-4xl">{word.word}</p>
            {word.phonetic && <span className="font-mono text-sm text-stone-400">{word.phonetic}</span>}
          </div>
          <p className="mt-5 font-serif text-lg leading-relaxed text-stone-500">
            {parts[0]}
            <mark className="hl-new text-stone-800">{parts[1]}</mark>
            {parts[2]}
          </p>
        </>
      ) : (
        // 标记的是整句（或原句里找不到这个词）：直接显示这句英文
        <p className="mt-8 font-serif text-2xl leading-relaxed text-stone-900">{word.word}</p>
      )}

      {/* ===== 背面：中文释义 ===== */}
      {revealed && (
        <div className="mt-8 border-t border-stone-100 pt-6">
          <p className="text-xl leading-relaxed whitespace-pre-line text-stone-800">
            {word.pos && <span className="mr-2 text-sm text-stone-400">{word.pos}</span>}
            {word.translation || '（暂无释义）'}
          </p>
          {word.etymology && <p className="mt-2 text-sm text-stone-500">词根：{word.etymology}</p>}
          <ReviewNote word={word} onSaveNote={onSaveNote} />
          {word.source && <p className="mt-4 text-xs text-stone-400">出自《{word.source}》</p>}
        </div>
      )}

      {/* ===== 操作区 ===== */}
      {/* 左边「‹ 上一个」，右边显示答案 / 评分按钮，宽度 1 : 4 */}
      <div className="mt-10 grid grid-cols-[1fr_4fr] gap-2 sm:gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onBack?.()
          }}
          disabled={!onBack}
          title={onBack ? '回到上一个词（撤销上一次评分）' : '已经是本轮第一个词'}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-stone-200 text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 active:scale-[0.98] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <span>‹ 上一个</span>
          <Kbd>Z</Kbd>
        </button>
        {!revealed ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReveal()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3 pointer-coarse:py-4 text-sm font-medium text-white transition hover:bg-stone-700 active:scale-[0.99]"
          >
            显示答案
            <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] text-white/70 pointer-coarse:hidden">空格</kbd>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {GRADES.map(({ rating, label, key, tone }) => (
              <button
                key={rating}
                type="button"
                onClick={() => onRate(rating)}
                className={`flex flex-col items-center gap-1 rounded-xl border border-stone-200 py-3 transition active:scale-[0.98] pointer-coarse:py-4 ${TONE[tone]}`}
              >
                <span className="text-sm font-medium">{label}</span>
                {/* 按这个键，下次多久后复习 */}
                <span className="text-[11px] text-stone-400">{formatInterval(previews[rating] - revealedAt)}</span>
                <Kbd>{key}</Kbd>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ title, desc, children }) {
  return (
    <div className="animate-pop py-24 text-center">
      <p className="font-serif text-2xl font-semibold text-stone-900">{title}</p>
      <p className="mt-3 text-sm text-stone-500">{desc}</p>
      {children}
      <a
        href="#/"
        className="mt-8 inline-block rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100"
      >
        返回阅读
      </a>
    </div>
  )
}

export default function ReviewPage({ words }) {
  // 本轮复习队列：进入页面时取一次到期的词，之后不跟随数据库实时变化，避免卡片乱跳
  const [queue, setQueue] = useState(null) // null = 加载中
  const [revealedAt, setRevealedAt] = useState(null) // 翻开答案的时间戳；null = 还没翻开
  const revealed = revealedAt !== null
  const [finished, setFinished] = useState(0) // 本轮已完成（不再出现）的词数
  const [reviews, setReviews] = useState(0) // 本轮总评分次数
  const busy = useRef(false) // 防止连按快捷键对同一张卡评两次分
  // 本轮的评分记录，用来「‹ 上一个」：每次评分前存一份 { word: 评分前的记录, queue, finished, reviews }。
  // 只能退到本轮第一个词；离开复习页就清空
  const [history, setHistory] = useState([])
  const now = useNow()

  useEffect(() => {
    let alive = true
    getDueWords().then((list) => alive && setQueue(list))
    return () => {
      alive = false
    }
  }, [])

  const current = queue?.[0]

  const rate = useCallback(
    async (rating) => {
      if (!current || busy.current) return
      busy.current = true
      try {
        const reviewedAt = new Date()
        const fields = grade(current, rating, reviewedAt)
        setHistory((h) => [...h, { word: current, queue, finished, reviews }])
        await saveReview(current.id, fields)

        // 下次到期在 20 分钟内（学习阶段的短间隔）→ 排到队尾，本轮再复习一次
        const again = new Date(fields.due) - reviewedAt <= LEARN_AHEAD_MS
        setQueue((q) => (again ? [...q.slice(1), { ...current, ...fields }] : q.slice(1)))
        if (!again) setFinished((n) => n + 1)
        setReviews((n) => n + 1)
        setRevealedAt(null)
      } finally {
        busy.current = false
      }
    },
    [current, queue, finished, reviews],
  )

  // 回到上一个词：把它的复习进度恢复成评分前的样子，再翻开答案让你重新评分（不会算成复习了两次）
  const back = useCallback(async () => {
    const last = history.at(-1)
    if (!last || busy.current) return
    busy.current = true
    try {
      await saveReview(last.word.id, fromCard(toCard(last.word)))
      // 笔记以数据库里的为准：评分之后写的笔记（包括翻到下一张时自动保存的）不会被撤销
      const notes = new Map((await db.words.bulkGet(last.queue.map((w) => w.id))).filter(Boolean).map((w) => [w.id, w.note]))
      setQueue(last.queue.map((w) => ({ ...w, note: notes.get(w.id) ?? w.note })))
      setFinished(last.finished)
      setReviews(last.reviews)
      setHistory((h) => h.slice(0, -1))
      setRevealedAt(Date.now())
    } finally {
      busy.current = false
    }
  }, [history])
  const canBack = history.length > 0

  // 保存笔记：写数据库，同时更新本轮队列里这个词的副本（队列是进入页面时的快照，排到队尾的那份也要带上新笔记）
  const currentId = current?.id
  const saveNote = useCallback(
    (note) => {
      if (!currentId) return
      updateWordNote(currentId, note)
      setQueue((q) => q?.map((w) => (w.id === currentId ? { ...w, note: note.trim() } : w)))
    },
    [currentId],
  )

  // 快捷键：空格 / 回车 显示答案；1 2 3 评分（正在输入笔记时不触发，打数字不会把卡片评分掉）
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'z' || e.key === 'Z') return back()
      if (!current) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        setRevealedAt(Date.now())
      } else if (revealed) {
        const g = GRADES.find((x) => x.key === e.key)
        if (g) rate(g.rating)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, revealed, rate, back])

  if (queue === null) return null

  let body
  if (current) {
    body = (
      <ReviewCard
        key={`${current.id}-${reviews}`}
        word={current}
        revealedAt={revealedAt}
        onReveal={() => setRevealedAt(Date.now())}
        onRate={rate}
        onSaveNote={saveNote}
        onBack={canBack ? back : null}
      />
    )
  } else if (reviews > 0) {
    body = (
      <EmptyState title="本轮复习完成 🎉" desc={`复习了 ${finished} 个词，共评分 ${reviews} 次`}>
        {canBack && (
          <button type="button" onClick={back} className="mt-8 mr-2 inline-block rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100">
            ‹ 回到上一个
          </button>
        )}
      </EmptyState>
    )
  } else if (words.length === 0) {
    body = <EmptyState title="生词本还是空的" desc="在阅读页划选单词，点击 Mark 标记后就会出现在这里" />
  } else {
    const nextDue = Math.min(...words.map((w) => new Date(w.due).getTime()))
    body = (
      <EmptyState
        title="今天没有要复习的词"
        desc={nextDue > now ? `下一个词将在 ${formatInterval(nextDue - now)}后到期` : '有新的词到期了，刷新页面开始复习'}
      />
    )
  }

  const total = finished + (queue?.length ?? 0)

  return (
    <main className="mx-auto max-w-2xl px-4 pt-10 pb-32 sm:px-6 sm:pt-16">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium tracking-widest text-stone-400 uppercase">Daily Review</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-stone-900">每日复习</h1>
        </div>
        {total > 0 && (
          <p className="text-sm text-stone-400">
            剩余 <span className="font-medium text-stone-700">{queue.length}</span> 个
          </p>
        )}
      </div>

      {total > 0 && (
        <div className="mb-8 h-1 overflow-hidden rounded-full bg-stone-200/70">
          <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${(finished / total) * 100}%` }} />
        </div>
      )}

      {body}

      {current && (
        <p className="mt-6 text-center text-xs text-stone-400 pointer-coarse:hidden">
          快捷键：<Kbd>空格</Kbd> 显示答案 · <Kbd>1</Kbd> 忘记 <Kbd>2</Kbd> 模糊 <Kbd>3</Kbd> 认识 · <Kbd>Z</Kbd> 上一个
        </p>
      )}
    </main>
  )
}
