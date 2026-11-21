import { useCallback, useEffect, useState } from 'react'

// 单词由字母、数字组成；撇号只有夹在两个字母之间时才算单词的一部分（it's、don't），
// 所以 ‘word’ 两侧的引号不会被吸进来。连字符、空格、其他标点都算单词边界
// （所以 well-chosen 里可以单独选 chosen）
const CORE_CHAR = /[\p{L}\p{N}]/u
const APOSTROPHE = /['’]/
const isCore = (ch) => !!ch && CORE_CHAR.test(ch)

/** 节点所在的段落（找不到时返回 null） */
function blockOf(node) {
  return (node.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest('p') ?? null
}

/**
 * 把 (node, offset) 这个位置换算成它在段落纯文本里的字符偏移量。
 * 做法：建一个“从段落开头到该位置”的临时 Range，取它的文本长度。
 * 段落里已经被 mark.js 插入了 <mark> 标签也不受影响。
 */
function textOffset(block, node, offset) {
  const r = document.createRange()
  r.setStart(block, 0)
  r.setEnd(node, offset)
  return r.toString().length
}

/** 反过来：把段落纯文本里的字符偏移量换算回 (文本节点, 节点内偏移) */
function pointAt(block, charOffset) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let remaining = charOffset
  let node
  let last = null
  while ((node = walker.nextNode())) {
    if (remaining <= node.data.length) return [node, remaining]
    remaining -= node.data.length
    last = node
  }
  return last ? [last, last.data.length] : [block, 0]
}

/**
 * 把选区吸附到完整单词：
 *  1) 去掉两端多选的空格和标点（"skill." → "skill"）
 *  2) 起点 / 终点落在单词中间时，向外扩展到单词边界（perspecti → perspectives）
 * 返回新的 Range；如果选区里一个字母数字都没有，返回 null。
 */
function snapToWords(range) {
  const startBlock = blockOf(range.startContainer)
  const endBlock = blockOf(range.endContainer)
  if (!startBlock || !endBlock) return range

  const startText = startBlock.textContent
  const endText = endBlock.textContent
  let s = textOffset(startBlock, range.startContainer, range.startOffset)
  let e = textOffset(endBlock, range.endContainer, range.endOffset)

  // 1) 先向内收缩：去掉两端不是字母数字的字符。
  //    必须先收缩再扩展，否则只选中 ", " 时，起点紧贴着前一个单词，会被错误地扩展进去。
  //    点按查词时选区是“折叠”的（只有一个光标位置），跳过收缩，直接扩展成光标所在的单词
  if (!range.collapsed) {
    while (s < startText.length && !isCore(startText[s])) s++
    while (e > 0 && !isCore(endText[e - 1])) e--
    if (startBlock === endBlock && e <= s) return null // 只选中了空格 / 标点
  }

  // 2) 再向外扩展：前一个字符还属于同一个单词，就继续往前；终点同理往后
  const partOfWordBefore = (i) => isCore(startText[i - 1]) || (APOSTROPHE.test(startText[i - 1]) && isCore(startText[i - 2]))
  const partOfWordAfter = (i) => isCore(endText[i]) || (APOSTROPHE.test(endText[i]) && isCore(endText[i + 1]))
  while (s > 0 && partOfWordBefore(s)) s--
  while (e < endText.length && partOfWordAfter(e)) e++
  if (startBlock === endBlock && e <= s) return null // 点在了空白处

  const snapped = document.createRange()
  snapped.setStart(...pointAt(startBlock, s))
  snapped.setEnd(...pointAt(endBlock, e))
  return snapped.toString().trim() ? snapped : null
}

/**
 * 把选区向两侧扩展到句子边界（. ! ? 后跟空白），返回选区所在的完整句子。
 * 选区跨了多句时，返回覆盖这几句的整段文字。
 */
function getSentence(range) {
  const paragraph = blockOf(range.startContainer)
  if (!paragraph) return range.toString().trim()

  const text = paragraph.textContent
  const start = textOffset(paragraph, range.startContainer, range.startOffset)
  const end = start + range.toString().length

  // 往左找上一个句末标点，往右找下一个句末标点
  const boundary = /[.!?]["'”’)]*\s/g
  let sentenceStart = 0
  let sentenceEnd = text.length
  for (const m of text.matchAll(boundary)) {
    const stop = m.index + m[0].trimEnd().length // 句末标点（含引号）之后的位置
    if (stop <= start) sentenceStart = m.index + m[0].length
    else if (stop >= end) {
      sentenceEnd = stop
      break
    }
  }
  return text.slice(sentenceStart, sentenceEnd).trim()
}

/** 屏幕坐标 (x, y) 处的文字光标位置（点按查词用） */
function caretRangeAt(x, y) {
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y)
    if (!p) return null
    const r = document.createRange()
    r.setStart(p.offsetNode, p.offset)
    r.collapse(true)
    return r
  }
  return document.caretRangeFromPoint?.(x, y) ?? null
}

/** 点击位置是否真的落在这个单词上（点在行尾空白处时，浏览器也会给出行尾的光标位置，要排除） */
function rangeContainsPoint(range, x, y, slop = 4) {
  return [...range.getClientRects()].some(
    (r) => x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop,
  )
}

const sameRange = (a, b) =>
  a.compareBoundaryPoints(Range.START_TO_START, b) === 0 && a.compareBoundaryPoints(Range.END_TO_END, b) === 0

const TAP_MAX_MOVE = 10 // 手指移动超过 10px 就不算“点按”（是在滚动）
const TAP_MAX_MS = 500 // 按住超过 0.5 秒就不算“点按”（是长按选词）
const TOUCH_SETTLE_MS = 400 // 触屏拖动选区时，停手 0.4 秒后再弹出翻译

/**
 * 监听 containerRef 内的划词，返回选中的文本、它在页面上的坐标，以及输入方式（mouse / touch）。
 * ignoreRef 指向的元素（即气泡本身）里的点击不会关闭气泡。
 *
 * - 鼠标：mouseup 时读取选区
 * - 触屏（iPhone / iPad）：没有 mouseup，改为监听 selectionchange（长按选词、拖动选区手柄），
 *   停手后再弹出；另外支持“点按单词直接查词”
 */
export function useTextSelection(containerRef, ignoreRef) {
  const [selection, setSelection] = useState(null)

  const clear = useCallback(() => {
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  useEffect(() => {
    const isInside = (ref, node) => !!ref.current && !!node && ref.current.contains(node)
    let pointerType = 'mouse' // 最近一次操作用的是鼠标还是手指
    let down = null // 最近一次按下的位置和时间，用来判断是不是“点按”
    let settleTimer = null
    let lastWidth = window.innerWidth

    /** 把（已吸附到完整单词的）range 显示为选区，并弹出气泡 */
    const show = (range, input) => {
      const sel = window.getSelection()
      // 只有吸附后的范围和当前选区不同时才替换。替换选区本身会触发 selectionchange，
      // 不加这个判断，触屏模式下会无限循环
      const current = sel.rangeCount ? sel.getRangeAt(0) : null
      if (!current || !sameRange(current, range)) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
      const text = range.toString().trim()

      // ===== 核心坐标计算 =====
      // getBoundingClientRect() 返回选区相对于“视口”的矩形；
      // 选区跨多行时，它是包住所有行的最小矩形。
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return

      // 加上 scrollX/scrollY，把视口坐标换算成“文档坐标”。
      // 气泡用 position:absolute 挂在 body 下，页面滚动时就会跟着文字走，
      // 不需要再监听 scroll 事件重新计算。
      const anchor = {
        centerX: rect.left + rect.width / 2 + window.scrollX, // 选区水平中点
        top: rect.top + window.scrollY, // 选区上边缘，默认把气泡放在这里的上方
        bottom: rect.bottom + window.scrollY, // 选区下边缘，上方空间不够时改放下方
      }
      setSelection((prev) =>
        // 同一个选区重复触发时保持原对象不变，避免气泡重新挂载、重复查询
        prev && prev.text === text && prev.input === input && prev.anchor.top === anchor.top && prev.anchor.centerX === anchor.centerX
          ? prev
          : {
              text,
              // 选区所在的整句话，存进生词本当语境，也留给 AI 翻译用
              context: getSentence(range),
              anchor,
              input, // 'mouse'：浮动气泡；'touch'：底部弹出卡片
            },
      )
    }

    /** 读取浏览器当前的选区，吸附到完整单词后显示 */
    const showCurrentSelection = (input) => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) return
      // 只响应阅读区内的划词，导航栏等其他地方的选区忽略
      if (!isInside(containerRef, sel.getRangeAt(0).commonAncestorContainer)) return
      const range = snapToWords(sel.getRangeAt(0))
      if (range) show(range, input)
    }

    // 按下时：记录输入方式；落在气泡外（空白处，或开始新一次划词）就关闭气泡
    const handlePointerDown = (e) => {
      pointerType = e.pointerType === 'mouse' ? 'mouse' : 'touch' // Apple Pencil 也按触屏处理
      down = { x: e.clientX, y: e.clientY, t: e.timeStamp }
      if (!isInside(ignoreRef, e.target)) setSelection(null)
    }

    // 鼠标松开：读取选区。触屏点按后浏览器也会补发一个 mouseup，要忽略
    const handleMouseUp = (e) => {
      if (pointerType !== 'mouse' || isInside(ignoreRef, e.target)) return
      // 点在已有选区上时，浏览器要等 mouseup 结束后才折叠选区，
      // 所以推迟到下一帧再读，拿到的才是最新状态
      requestAnimationFrame(() => showCurrentSelection('mouse'))
    }

    // 触屏点按：找到手指下的单词，直接查词
    const handlePointerUp = (e) => {
      if (pointerType !== 'touch' || !down) return
      const isTap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < TAP_MAX_MOVE && e.timeStamp - down.t < TAP_MAX_MS
      if (!isTap || !isInside(containerRef, e.target) || isInside(ignoreRef, e.target)) return
      const { clientX: x, clientY: y } = e
      // 等浏览器处理完这次点按（它可能会清掉旧选区）再设置新选区
      setTimeout(() => {
        const caret = caretRangeAt(x, y)
        if (!caret || !isInside(containerRef, caret.startContainer)) return
        const word = snapToWords(caret)
        if (word && rangeContainsPoint(word, x, y)) show(word, 'touch')
      }, 0)
    }

    // 触屏长按选词 / 拖动选区手柄：选区一变就重新计时，停手后再弹出
    const handleSelectionChange = () => {
      if (pointerType !== 'touch') return
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => showCurrentSelection('touch'), TOUCH_SETTLE_MS)
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') clear()
    }

    // 窗口宽度变化会导致文字重新换行，之前记下的坐标失效，直接关掉。
    // 只看宽度：手机上滚动时地址栏伸缩会改变高度、触发 resize，不能因此关掉
    const handleResize = () => {
      if (window.innerWidth === lastWidth) return
      lastWidth = window.innerWidth
      setSelection(null)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(settleTimer)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [containerRef, ignoreRef, clear])

  return { selection, clear }
}
