import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLookup } from '../services/translate'

const GAP = 10 // 气泡与选区之间的间距
const EDGE = 12 // 气泡与视口左右边缘的最小留白

/**
 * 笔记：写这个词在这里的意思、例句、联想……
 * - 还没标记：输入框；点 Mark 时和单词一起保存
 * - 已标记、没在编辑：笔记显示成普通文字（已保存的样子），旁边「编辑」
 * - 已标记、正在编辑：输入框；改了内容后主按钮变成「保存」（见 LookupContent）
 */
/** 输入框出现时自动聚焦，光标放在已有内容的末尾（点「编辑」后接着往后写） */
const caretToEnd = (el) => {
  if (!el || el.dataset.focused) return
  el.dataset.focused = '1'
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
}

function NoteSection({ noteCtl, marked, large }) {
  const { open, setOpen, editing, startEditing, cancelEditing, draft, setDraft, note, dirty } = noteCtl
  const textareaClass =
    'w-full resize-none rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-base leading-relaxed text-stone-700 outline-none focus:border-stone-400 focus:bg-white sm:text-sm'

  // 已标记、没在编辑：显示已保存的笔记
  if (marked && !editing) {
    if (!note) {
      return (
        <button type="button" onClick={startEditing} className="mt-3 text-xs text-stone-400 transition-colors hover:text-stone-700">
          📝 添加笔记
        </button>
      )
    }
    return (
      <div className="mt-3 rounded-md bg-amber-50/70 px-3 py-2 text-sm leading-relaxed whitespace-pre-line text-stone-700">
        <div className="mb-0.5 flex items-center justify-between text-[11px]">
          <span className="font-medium text-amber-700">📝 我的笔记</span>
          <button type="button" onClick={startEditing} className="rounded px-1.5 text-stone-400 hover:bg-white hover:text-stone-700">
            编辑
          </button>
        </div>
        {note}
      </div>
    )
  }

  // 还没标记：先点「添加笔记」再出现输入框
  if (!marked && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-xs text-stone-400 transition-colors hover:text-stone-700">
        📝 添加笔记
      </button>
    )
  }

  return (
    <div className="mt-3">
      <textarea
        ref={caretToEnd}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={large ? 3 : 2}
        placeholder="笔记：在这里的意思、例句、联想……"
        className={textareaClass}
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-stone-400">
        <span>{marked ? (dirty ? '点「保存」保存笔记' : '') : '点 Mark 时和单词一起保存'}</span>
        {marked && (
          <button type="button" onClick={cancelEditing} className="rounded px-1.5 hover:bg-stone-100 hover:text-stone-700">
            取消
          </button>
        )}
      </div>
    </div>
  )
}

/** 气泡 / 底部卡片共用的内容：单词、音标、释义、笔记、来源、Mark 按钮 */
function LookupContent({ selection, lookup, marked, onToggleMark, noteCtl, large }) {
  const { text } = selection
  const { status, data, error, source } = lookup
  const isWord = !/\s/.test(text)

  return (
    <>
      <div className="flex items-baseline gap-2">
        <p
          className={`font-serif text-stone-900 ${
            isWord ? (large ? 'text-xl font-semibold' : 'text-lg font-semibold') : `line-clamp-2 italic ${large ? 'text-base' : 'text-sm'}`
          }`}
        >
          {text}
        </p>
        {data?.phonetic && <span className="shrink-0 font-mono text-xs text-stone-400">{data.phonetic}</span>}
      </div>

      {status === 'loading' && (
        // 加载中：骨架屏占位
        <div className="mt-3 space-y-2" aria-label="查询中">
          <div className="h-3 w-4/5 animate-pulse rounded bg-stone-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-stone-100" />
        </div>
      )}

      {status === 'error' && <p className="mt-2 text-sm leading-relaxed text-rose-600">{error}</p>}

      {status === 'done' && (
        <>
          {data.note && <p className="mt-1.5 text-xs text-stone-400">{data.note}</p>}
          {/* 词典释义可能有多行（每行一个词性），用 pre-line 保留换行 */}
          <p className={`mt-2 leading-relaxed whitespace-pre-line text-stone-700 ${large ? 'text-base' : 'text-sm'}`}>
            {data.pos && <span className="mr-1.5 text-xs font-medium text-stone-400">{data.pos}</span>}
            {data.translation || '（没有查到释义）'}
          </p>
          {data.etymology && <p className="mt-1.5 text-xs leading-relaxed text-stone-500">词根：{data.etymology}</p>}
        </>
      )}

      <NoteSection noteCtl={noteCtl} marked={marked} large={large} />

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-100 pt-3">
        {/* 当前查词来源：辞典 / 豆包 / OpenAI / Gemini */}
        <span className="text-[11px] tracking-wide text-stone-300">
          {status === 'loading' ? `${source} 查询中…` : data?.via ? `${source} · ${data.via}` : source}
        </span>
        {marked && noteCtl.editing && noteCtl.dirty ? (
          // 正在编辑已标记词的笔记：主按钮就是「保存」
          <button
            type="button"
            onClick={noteCtl.save}
            className={`shrink-0 rounded-md bg-ink font-medium text-white transition hover:bg-stone-700 active:scale-95 ${large ? 'px-4 py-2.5 text-sm' : 'px-3 py-1.5 text-xs'}`}
          >
            保存
          </button>
        ) : (
        /* 再次点击即可取消标记；已标记时悬停提示“取消标记”（触屏没有悬停，直接写在按钮上） */
        <button
          type="button"
          aria-pressed={marked}
          // 释义还在加载时不能标记（否则存进去的释义是空的）；已标记的词随时可以取消
          disabled={!marked && status === 'loading'}
          onClick={() => onToggleMark?.({ ...selection, ...(data ?? {}), note: noteCtl.draft })}
          className={`group shrink-0 rounded-md font-medium transition active:scale-95 ${large ? 'px-4 py-2.5 text-sm' : 'px-3 py-1.5 text-xs'} ${
            marked
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-stone-100 hover:text-stone-600 hover:ring-stone-200'
              : 'bg-ink text-white hover:bg-stone-700 disabled:cursor-wait disabled:bg-stone-300'
          }`}
        >
          {marked ? (
            large ? (
              '已标记 ✓ · 点按取消'
            ) : (
              <>
                <span className="group-hover:hidden">已标记 ✓</span>
                <span className="hidden group-hover:inline">取消标记</span>
              </>
            )
          ) : (
            'Mark 标记生词'
          )}
        </button>
        )}
      </div>
    </>
  )
}

/** 触屏（iPhone / iPad）：从底部弹出的卡片。避免和 iOS 在选区上方弹出的「拷贝 / 查询」菜单重叠 */
/** 阻止 mousedown 的默认行为，点击气泡时不会清掉页面上的选区；但笔记输入框要能正常聚焦 */
const keepSelection = (e) => {
  if (!e.target.closest('textarea')) e.preventDefault()
}

function BottomSheet({ selection, lookup, marked, onToggleMark, noteCtl, ref }) {
  const { anchor } = selection
  // 手机上弹出输入法键盘时，把卡片抬到键盘上方（visualViewport 是去掉键盘后的可见区域）
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setKeyboardOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // 卡片弹出后，如果选中的词被卡片挡住，就把页面往上滚，让它露在卡片上方
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const visibleBottom = window.innerHeight - el.offsetHeight - 16
    const wordBottom = anchor.bottom - window.scrollY
    if (wordBottom > visibleBottom) window.scrollBy({ top: wordBottom - visibleBottom, behavior: 'smooth' })
  }, [anchor, ref, lookup.status])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="翻译"
      onMouseDown={keepSelection}
      // 底部留出 iPhone 横条（safe area）的高度
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)', bottom: keyboardOffset }}
      className="fixed inset-x-0 bottom-0 z-50 animate-sheet rounded-t-2xl border-t border-stone-200/80 bg-white px-5 pt-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-200" />
      <div className="mx-auto max-h-[45vh] max-w-xl overflow-y-auto">
        <LookupContent selection={selection} lookup={lookup} marked={marked} onToggleMark={onToggleMark} noteCtl={noteCtl} large />
      </div>
    </div>
  )
}

/** 鼠标：在选区上方原位弹出的浮动气泡 */
function FloatingTooltip({ selection, lookup, marked, onToggleMark, noteCtl, ref }) {
  const { text, anchor } = selection
  const [pos, setPos] = useState(null)

  // useLayoutEffect 在浏览器绘制前执行：先用不可见状态渲染一次拿到气泡真实宽高，
  // 算好位置后再显示，避免气泡先闪到错误位置再跳过去
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()

    // ===== 核心坐标计算 =====
    // 1) 垂直方向：默认放在选区上方，气泡顶部 = 选区顶部 - 气泡高度 - 间距。
    //    如果选区离视口顶部太近（上方放不下，或会被吸顶导航栏 h-14=56px 挡住），就翻到选区下方。
    const NAV_HEIGHT = 56
    const spaceAbove = anchor.top - window.scrollY - NAV_HEIGHT
    const placeBelow = spaceAbove < height + GAP
    const top = placeBelow ? anchor.bottom + GAP : anchor.top - height - GAP

    // 2) 水平方向：气泡中心对齐选区中点，即 left = 中点 - 宽度/2。
    //    再把 left 限制在 [视口左边 + 留白, 视口右边 - 宽度 - 留白] 之间，防止贴边时被裁掉。
    const minLeft = window.scrollX + EDGE
    const maxLeft = window.scrollX + document.documentElement.clientWidth - width - EDGE
    const left = Math.min(Math.max(anchor.centerX - width / 2, minLeft), maxLeft)

    // 3) 小三角箭头要始终指向选区中点；气泡被夹到边上时，箭头相对气泡的偏移会跟着变
    const arrowX = Math.min(Math.max(anchor.centerX - left, 16), width - 16)

    setPos({ top, left, placeBelow, arrowX })
    // status 变化时（加载中 → 结果 / 出错）气泡高度会变，需要重新计算位置
    // 笔记框展开时气泡也会变高，同样要重新定位
  }, [anchor, ref, text, lookup.status, noteCtl.open, noteCtl.editing, marked, noteCtl.note])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="翻译"
      // 阻止 mousedown 的默认行为，点击气泡内部时不会清掉页面上的选区高亮
      onMouseDown={keepSelection}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className={`absolute z-50 w-72 rounded-xl border border-stone-200/80 bg-white/95 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur ${
        pos ? 'animate-pop' : ''
      } ${pos?.placeBelow ? 'origin-top' : 'origin-bottom'}`}
    >
      {/* 小三角：上方放置时在底部，下方放置时在顶部 */}
      {pos && (
        <span
          style={{ left: pos.arrowX }}
          className={`absolute size-2.5 -translate-x-1/2 rotate-45 border-stone-200/80 bg-white ${
            pos.placeBelow ? '-top-[6px] border-t border-l' : '-bottom-[6px] border-r border-b'
          }`}
        />
      )}
      <LookupContent selection={selection} lookup={lookup} marked={marked} onToggleMark={onToggleMark} noteCtl={noteCtl} />
    </div>
  )
}

export default function SelectionTooltip({ selection, marked, note = '', onToggleMark, onSaveNote, ref }) {
  const lookup = useLookup(selection.text, selection.context)

  const [open, setOpen] = useState(false) // 还没标记时，是否展开了笔记输入框
  const [editing, setEditing] = useState(false) // 已标记时，是否正在编辑笔记
  const [draft, setDraft] = useState(note)

  // 标记 / 取消标记之后：退出编辑状态，草稿同步为已保存的笔记（标记就等于保存）
  const [prevMarked, setPrevMarked] = useState(marked)
  if (marked !== prevMarked) {
    setPrevMarked(marked)
    setEditing(false)
    setDraft(note)
  }

  const dirty = marked && editing && draft.trim() !== note.trim()
  const save = async () => {
    await onSaveNote?.(draft)
    setEditing(false)
  }
  // 气泡关闭（卸载）时：已标记的词还有没保存的修改，自动保存一次，防止白写
  const pending = useRef(null)
  useEffect(() => {
    pending.current = dirty ? () => onSaveNote?.(draft) : null
  })
  useEffect(() => () => pending.current?.(), [])

  const noteCtl = {
    open,
    setOpen,
    editing,
    startEditing: () => {
      setDraft(note)
      setEditing(true)
    },
    cancelEditing: () => {
      setDraft(note)
      setEditing(false)
    },
    draft,
    setDraft,
    note,
    dirty,
    save,
  }
  const Shell = selection.input === 'touch' ? BottomSheet : FloatingTooltip
  return <Shell selection={selection} lookup={lookup} marked={marked} onToggleMark={onToggleMark} noteCtl={noteCtl} ref={ref} />
}
