import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// 「在这里结束本次阅读」横线
// - 手势：按住鼠标左键（或手指）在正文上横着来回划两下以上（像涂掉一行字），就在最近的那一行下面画线，问是否在这里结束
// - 确认后记下位置 { chapter, paragraph, offset }：第几章、本章第几段、这一行从段落的第几个字开始。
//   记的是文字位置而不是屏幕坐标，所以调整阅读宽度、换设备重新排版后，横线仍在同一句话那里
// - 在横线那一行上双击（触屏双击）：取消横线，不查词；其他地方双击照旧查词

const MIN_SEGMENT = 30 // 一笔至少横着走 30px 才算一段
const MIN_REVERSALS = 2 // 至少折返两次（右→左→右）：只拖选一次、拖过头再拉回来一次，都不会误触发
const MAX_DRIFT_Y = 40 // 上下偏移超过 40px 就不算横线（是在选多行文字）
const DOUBLE_TAP_MS = 350

const blocks = (container) => [...container.querySelectorAll('[data-pi]')].filter((el) => el.tagName !== 'FIGURE')

/** 段落纯文本里第 i 个字符的位置矩形（空白字符在换行处的位置不可靠，返回 null） */
function charRect(block, i) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let remaining = i
  let node
  while ((node = walker.nextNode())) {
    if (remaining < node.data.length) {
      if (/\s/.test(node.data[remaining])) return null
      const r = document.createRange()
      r.setStart(node, remaining)
      r.setEnd(node, remaining + 1)
      return r.getClientRects()[0] ?? null
    }
    remaining -= node.data.length
  }
  return null
}

/** 第 offset 个字符所在的那一行：返回 { top, bottom }（视口坐标） */
function lineAt(block, offset) {
  const text = block.textContent
  for (let i = offset; i < text.length; i++) {
    const r = charRect(block, i)
    if (r) return { top: r.top, bottom: r.bottom }
  }
  return null
}

/** 这一行从段落的第几个字符开始：从 offset 往前找，直到字符跑到上一行 */
function lineStart(block, offset) {
  const text = block.textContent
  let i = Math.min(offset, text.length - 1)
  while (i > 0 && !charRect(block, i)) i-- // 落在空白上时，往前找到一个实字
  const base = charRect(block, i)
  if (!base) return 0
  let start = i
  for (let j = i - 1; j >= 0; j--) {
    const r = charRect(block, j)
    if (!r) continue
    if (Math.abs(r.top - base.top) > base.height / 2) break
    start = j
  }
  return start
}

/** 离 y 最近的正文段落（插图跳过） */
function nearestBlock(container, y) {
  let best = null
  let bestDist = Infinity
  for (const el of blocks(container)) {
    const r = el.getBoundingClientRect()
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    if (d < bestDist) {
      best = el
      bestDist = d
    }
  }
  return best
}

/** 屏幕坐标 (x, y) 处的字符在段落里的偏移量 */
function offsetAt(block, x, y) {
  let node = null
  let off = 0
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y)
    if (p) [node, off] = [p.offsetNode, p.offset]
  } else {
    const r = document.caretRangeFromPoint?.(x, y)
    if (r) [node, off] = [r.startContainer, r.startOffset]
  }
  if (!node || !block.contains(node)) return 0
  const r = document.createRange()
  r.setStart(block, 0)
  r.setEnd(node, off)
  return r.toString().length
}

/** 手势位置 → 书签位置（chapter 由调用方补上） */
function locate(container, x, y) {
  const block = nearestBlock(container, y)
  if (!block) return null
  const br = block.getBoundingClientRect()
  const cy = Math.min(Math.max(y, br.top + 2), br.bottom - 2)
  const cx = Math.min(Math.max(x, br.left + 2), br.right - 2)
  return { paragraph: Number(block.dataset.pi), offset: lineStart(block, offsetAt(block, cx, cy)) }
}

/** 书签位置 → 横线的文档坐标 { left, right, top, bottom }（这一页上没有这个段落时返回 null） */
function measure(container, mark) {
  const block = container?.querySelector(`[data-pi="${mark.paragraph}"]`)
  if (!block) return null
  const line = lineAt(block, mark.offset)
  if (!line) return null
  const br = block.getBoundingClientRect()
  return { left: br.left + window.scrollX, right: br.right + window.scrollX, top: line.top + window.scrollY, bottom: line.bottom + window.scrollY }
}

/**
 * props：
 * - containerRef：正文 <article>；每段带 data-pi（本章第几段）
 * - chapter、pageKey（翻页时重新计算位置）
 * - bookmark：已保存的横线 { chapter, paragraph, offset } 或 null
 * - onSave(bookmark)、onRemove()
 * - scrollRequest：打开书时为 true，横线画出来后把它滚到屏幕上方 1/3 处，然后调用 onScrolled
 */
export default function ReadingStopLine({ containerRef, chapter, pageKey, bookmark, onSave, onRemove, scrollRequest, onScrolled }) {
  const [pending, setPending] = useState(null) // 刚划出、等待确认的横线位置
  const [lines, setLines] = useState({ saved: null, pending: null })
  const savedHere = bookmark && bookmark.chapter === chapter ? bookmark : null

  // ---- 计算横线位置：翻页、改宽度、窗口缩放、字体加载后都要重新算 ----
  const recompute = useCallback(() => {
    const c = containerRef.current
    setLines({ saved: savedHere && measure(c, savedHere), pending: pending && measure(c, pending) })
  }, [containerRef, savedHere, pending])
  useLayoutEffect(() => {
    recompute()
  }, [recompute, pageKey])
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const ro = new ResizeObserver(() => recompute())
    ro.observe(c)
    return () => ro.disconnect()
  }, [containerRef, recompute, pageKey])

  // 打开书时滚动到横线
  useEffect(() => {
    if (!scrollRequest || !lines.saved) return
    window.scrollTo(0, Math.max(0, lines.saved.top - window.innerHeight / 3))
    onScrolled?.()
  }, [scrollRequest, lines.saved, onScrolled])

  // ---- 手势识别 + 双击横线那一行 ----
  const latest = useRef({})
  useEffect(() => {
    latest.current = { saved: lines.saved, onRemove, chapter }
  })
  useEffect(() => {
    let g = null // 正在进行的一笔：{ id, startY, lastX, dir, seg, reversals, xs, ys, active }
    let lastTap = null
    const inContainer = (node) => !!containerRef.current && containerRef.current.contains(node)
    const onRow = (x, y) => {
      const s = latest.current.saved
      const dy = y + window.scrollY
      const dx = x + window.scrollX
      return !!s && dy >= s.top - 4 && dy <= s.bottom + 6 && dx >= s.left - 8 && dx <= s.right + 8
    }

    const down = (e) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || !inContainer(e.target)) {
        g = null
        return
      }
      g = { startY: e.clientY, lastX: e.clientX, dir: 0, seg: 0, reversals: 0, xs: [e.clientX], ys: [e.clientY], active: false, t: e.timeStamp, x0: e.clientX }
    }
    const move = (e) => {
      if (!g || !e.isPrimary) return
      if (Math.abs(e.clientY - g.startY) > MAX_DRIFT_Y) {
        g = null // 上下走太多：在选多行或滚动，不是横线
        return
      }
      const dx = e.clientX - g.lastX
      g.lastX = e.clientX
      g.xs.push(e.clientX)
      g.ys.push(e.clientY)
      if (!dx) return
      const dir = Math.sign(dx)
      if (dir === g.dir || !g.dir) {
        g.seg += Math.abs(dx)
        g.dir = dir
      } else if (g.seg >= MIN_SEGMENT) {
        g.reversals++ // 走够一段后折返
        g.dir = dir
        g.seg = Math.abs(dx)
      } else {
        g.seg += Math.abs(dx) * -1 // 小抖动：抵消一点
        if (g.seg < 0) {
          g.dir = dir
          g.seg = -g.seg
        }
      }
      if (!g.active && g.reversals >= MIN_REVERSALS && g.seg >= MIN_SEGMENT / 2) {
        g.active = true
        document.body.style.userSelect = 'none'
      }
      if (g.active) window.getSelection()?.removeAllRanges() // 不让这一笔变成文字选区
    }
    const finishGesture = () => {
      const { xs, ys } = g
      document.body.style.userSelect = ''
      const x = (Math.min(...xs) + Math.max(...xs)) / 2
      const y = [...ys].sort((a, b) => a - b)[ys.length >> 1] // 中位数，不受起笔落笔抖动影响
      g = null
      window.getSelection()?.removeAllRanges()
      const loc = containerRef.current && locate(containerRef.current, x, y)
      if (loc) setPending({ chapter: latest.current.chapter, ...loc })
    }

    // 用 window 的捕获阶段，在划词逻辑（document 上的监听）之前处理，需要时拦下这次松手
    const up = (e) => {
      if (g?.active) {
        e.stopImmediatePropagation() // 这一笔是画线，不弹查词
        finishGesture()
        return
      }
      // 触屏双击横线那一行
      if (e.pointerType !== 'mouse' && g && Math.hypot(e.clientX - g.x0, e.clientY - g.startY) < 10 && e.timeStamp - g.t < 500) {
        const isDouble = lastTap && e.timeStamp - lastTap.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30
        if (isDouble && onRow(e.clientX, e.clientY)) {
          e.stopImmediatePropagation()
          lastTap = null
          latest.current.onRemove()
        } else lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY }
      }
      g = null
    }
    // 鼠标双击横线那一行：第二下松手时拦下，不查词，取消横线
    const mouseUp = (e) => {
      if (e.detail === 2 && inContainer(e.target) && onRow(e.clientX, e.clientY)) {
        e.stopImmediatePropagation()
        window.getSelection()?.removeAllRanges()
        latest.current.onRemove()
      }
    }
    const cancel = () => {
      if (g?.active) document.body.style.userSelect = ''
      g = null
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('mouseup', mouseUp, true)
    return () => {
      document.body.style.userSelect = ''
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('mouseup', mouseUp, true)
    }
  }, [containerRef])

  // 翻页 / 换章时丢掉没确认的横线
  const [prevKey, setPrevKey] = useState(pageKey)
  if (prevKey !== pageKey) {
    setPrevKey(pageKey)
    setPending(null)
  }

  // Esc 取消没确认的横线
  useEffect(() => {
    if (!pending) return
    const onKey = (e) => e.key === 'Escape' && setPending(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  const confirm = () => {
    onSave(pending)
    setPending(null)
  }

  const p = lines.pending
  const s = lines.saved
  return createPortal(
    <>
      {s && !p && (
        <div aria-hidden className="pointer-events-none absolute z-10" style={{ left: s.left, top: s.bottom + 1, width: s.right - s.left }}>
          <div className="h-[2.5px] rounded-full bg-rose-400/80" />
          <span className="absolute top-1/2 left-full ml-3 hidden -translate-y-1/2 font-sans text-xs whitespace-nowrap text-rose-400 lg:block">
            上次读到这里 · 双击这一行取消
          </span>
        </div>
      )}
      {p && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 h-0 border-t-[2.5px] border-dashed border-rose-400"
            style={{ left: p.left, top: p.bottom + 1, width: p.right - p.left }}
          />
          <div
            role="dialog"
            aria-label="结束阅读"
            className="animate-pop absolute z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-stone-200 bg-white/95 px-3 py-2 font-sans text-sm shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur"
            style={{ left: (p.left + p.right) / 2, top: p.bottom + 12 }}
          >
            <span className="text-stone-700">在这里结束本次阅读？</span>
            <button type="button" onClick={confirm} className="rounded-lg bg-ink px-3 py-1 text-white hover:bg-stone-700">
              是
            </button>
            <button type="button" onClick={() => setPending(null)} className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100">
              取消
            </button>
          </div>
        </>
      )}
    </>,
    document.body,
  )
}
