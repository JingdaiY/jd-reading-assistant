// PDF 版面还原：把 pdf.js 提取的“带坐标的文字片段”还原成段落。
// PDF 里只记录了“每段文字画在页面的哪个位置”，没有段落 / 标题结构，需要根据位置和字体推断：
//   1. 同一高度的片段拼成一行；行内出现很大的水平空隙时，切成多栏（表格）
//   2. 去掉每页都重复出现的页眉 / 页脚、单独的页码
//   3. 行距明显变大、字号或字体变化、以项目符号开头 → 新段落；行末连字符断开的单词接回去
//   4. 两栏表格按“左栏标题：右栏内容”输出
// 纯函数、不依赖浏览器，方便单独测试。
//
// 输入：pages = [{ items: [{ str, x, y, size, font }] }]（y 越大越靠上，和 PDF 坐标一致）
// 输出：段落字符串数组

const BULLET = /^[-•·▪◦–—*]\s/
// “1.” / “2)” 开头的编号列表项；也认点号后面直接跟大写字母的写法（“1.Question”），但不会误认 “3.5 million”
const NUMBERED = /^\d{1,3}[.)](?=\s|$|[A-Z])/
const ANSWER = /^(answer|a)\s*[:：]/i // 问答里的“Answer:”另起一段
const SENTENCE_END = /[.!?:;"”’)\]]$/
const COLUMN_GAP_RATIO = 2.5 // 行内水平空隙超过 2.5 个字号宽度 → 视为分栏
const HEADER_FOOTER_ZONE = 0.1 // 页面上下各 10% 的区域里找页眉页脚

const clean = (s) => s.replace(/\s+/g, ' ').trim()
const median = (arr) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const mostCommon = (weighted) => {
  let best = null
  let max = -1
  for (const [k, v] of weighted) if (v > max) [best, max] = [k, v]
  return best
}

/**
 * 找出这一页的“栏起始横坐标”：在行中间（不是行首）、前面有明显空隙开始的片段，
 * 如果它们的 x 在本页反复出现（≥3 次），就认为那里是某一栏的左边界（例如表格的第二栏）
 */
function findColumnStarts(lines) {
  const counts = new Map()
  for (const line of lines) {
    let lastEnd = -Infinity
    for (const [i, it] of line.items.entries()) {
      const gap = it.x - lastEnd
      if (i > 0 && it.str.trim() && gap > line.size * 0.6) {
        const key = Math.round(it.x)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      lastEnd = it.x + (it.width ?? it.str.length * line.size * 0.5)
    }
  }
  return [...counts].filter(([, n]) => n >= 3).map(([x]) => x)
}

/** 一页的片段 → 行。每行带：y、字号、字体、分栏后的各段 [{ x, text }] */
function buildLines(items) {
  const sorted = items.filter((it) => it.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines = []
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(l.size, it.size) * 0.4)
    if (line) line.items.push(it)
    else lines.push({ y: it.y, size: it.size, items: [it] })
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x)
  const columnStarts = findColumnStarts(lines)
  const isColumnStart = (x) => columnStarts.some((c) => Math.abs(c - x) <= 2)

  for (const line of lines) {
    // 字号 / 字体取这一行里字符最多的那个
    const sizes = new Map()
    const fonts = new Map()
    for (const it of line.items) {
      sizes.set(it.size, (sizes.get(it.size) ?? 0) + it.str.length)
      fonts.set(it.font, (fonts.get(it.font) ?? 0) + it.str.length)
    }
    line.size = mostCommon(sizes)
    line.font = mostCommon(fonts)
    // 按水平空隙切栏
    line.cells = []
    let cell = null
    let lastEnd = -Infinity
    for (const it of line.items) {
      const gap = it.x - lastEnd
      // 新的一栏：空隙特别大，或者正好从本页某一栏的左边界开始
      if (!cell || gap > line.size * COLUMN_GAP_RATIO || (it.str.trim() && gap > 0 && isColumnStart(it.x))) {
        cell = { x: it.x, text: '' }
        line.cells.push(cell)
      } else if (gap > line.size * 0.15 && !cell.text.endsWith(' ') && !it.str.startsWith(' ')) {
        cell.text += ' '
      }
      cell.text += it.str
      lastEnd = it.x + (it.width ?? it.str.length * line.size * 0.5)
    }
    line.cells = line.cells.map((c) => ({ ...c, text: clean(c.text) })).filter((c) => c.text)
    line.text = line.cells.map((c) => c.text).join(' ')
  }
  return lines.filter((l) => l.text).sort((a, b) => b.y - a.y)
}

/** 每页都在相近位置重复出现的行（页眉、页脚、书名、页码）→ 要删掉的“指纹”集合 */
function findRepeatedLines(pages) {
  const counts = new Map()
  for (const { lines, height } of pages) {
    const seen = new Set()
    // 只看每页最上面两行和最下面两行，而且要在页面上下边缘区域里
    const edge = [...lines.slice(0, 2), ...lines.slice(-2)]
    for (const l of edge) {
      const inZone = l.y > height * (1 - HEADER_FOOTER_ZONE) || l.y < height * HEADER_FOOTER_ZONE
      if (!inZone) continue
      const key = l.text.toLowerCase().replace(/\d+/g, '#')
      if (!seen.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
      seen.add(key)
    }
  }
  const minPages = Math.max(3, Math.ceil(pages.length * 0.4))
  return new Set([...counts].filter(([, n]) => n >= minPages).map(([k]) => k))
}

/**
 * 多栏正文（比如双栏论文）：把每一行拆成各栏，先读完左栏再读右栏，变回单栏的行序列。
 * 和表格的区别：表格左栏是很短的小标题，正文分栏时左右两栏都是长句子。
 */
function columnsToLines(lines) {
  const xs = [...new Set(lines.flatMap((l) => l.cells.map((c) => Math.round(c.x))))].sort((a, b) => a - b)
  const columnOf = (x) => xs.filter((cx) => x >= cx - 2).length - 1
  const byColumn = new Map()
  for (const l of lines) {
    for (const c of l.cells) {
      const col = columnOf(c.x)
      byColumn.set(col, [...(byColumn.get(col) ?? []), { ...l, cells: [c], text: c.text }])
    }
  }
  return [...byColumn.keys()].sort((a, b) => a - b).flatMap((k) => byColumn.get(k))
}

/** 多栏的行看起来像“正文分栏”而不是“表格”：左栏单元格平均也有不少字 */
function looksLikeTextColumns(lines) {
  const left = lines.filter((l) => l.cells.length > 1).map((l) => l.cells[0].text.length)
  return left.length > 0 && left.reduce((a, b) => a + b, 0) / left.length > 30
}

/** 两栏表格：左栏是小标题、右栏是内容。按垂直方向分块后配对，输出“左：右” */
function tableToParagraphs(lines) {
  const xs = lines.flatMap((l) => l.cells.map((c) => c.x))
  const leftX = Math.min(...xs)
  const blocks = { left: [], right: [] }
  for (const l of lines) {
    for (const c of l.cells) {
      const side = c.x - leftX < l.size * COLUMN_GAP_RATIO ? 'left' : 'right'
      const list = blocks[side]
      const prev = list.at(-1)
      // 和上一块垂直方向挨着（行距以内）就并入同一块
      if (prev && prev.bottom - l.y <= l.size * 1.6) {
        prev.text += ' ' + c.text
        prev.bottom = l.y
      } else {
        list.push({ top: l.y, bottom: l.y, text: c.text })
      }
    }
  }
  return blocks.right.map((r) => {
    const label = blocks.left.find((b) => b.top >= r.bottom - 1 && b.bottom <= r.top + 1)
    return label ? `${clean(label.text)}：${clean(r.text)}` : clean(r.text)
  })
}

/** 把一行接到段落末尾：行末连字符断开的单词接回去（docu- + mentation → documentation） */
function appendLine(paragraph, text) {
  if (/[a-z]-$/.test(paragraph) && /^[a-z]/.test(text)) return paragraph.slice(0, -1) + text
  return paragraph ? `${paragraph} ${text}` : text
}

export function layoutToParagraphs(rawPages, { breakPages } = {}) {
  const pages = rawPages.map((p) => ({ height: p.height ?? 842, lines: buildLines(p.items) }))
  const repeated = findRepeatedLines(pages)

  // 正文字号：全书字符最多的字号；正文行距：正文字号的行与行之间最常见的间距
  const sizeChars = new Map()
  for (const p of pages) for (const l of p.lines) sizeChars.set(l.size, (sizeChars.get(l.size) ?? 0) + l.text.length)
  const bodySize = mostCommon(sizeChars) ?? 12

  const paragraphs = []
  const paraPages = [] // 每一段开始于原 PDF 的第几页（从 0 开始），用于“查看原版页面”
  let current = null // { text, size, font, heading, page }

  const flush = () => {
    if (current?.text) {
      paragraphs.push(clean(current.text))
      paraPages.push(current.page)
    }
    current = null
  }

  const pageStarts = new Map() // 页码 → 这一页第一段在 paragraphs 里的下标
  for (const [pageIndex, page] of pages.entries()) {
    // 书签指向的页：先结束上一段，保证章节从这一页开始
    if (breakPages?.has(pageIndex)) flush()
    if (!pageStarts.has(pageIndex)) pageStarts.set(pageIndex, paragraphs.length + (current ? 1 : 0))
    // 删掉页眉页脚：只删出现在本页边缘（最上 / 最下两行、且在上下边缘区域）的重复行和单独的页码，正文里同样的句子不受影响
    const n = page.lines.length
    const atEdge = (l, i) => (i < 2 || i >= n - 2) && (l.y > page.height * (1 - HEADER_FOOTER_ZONE) || l.y < page.height * HEADER_FOOTER_ZONE)
    let lines = page.lines.filter(
      (l, i) => !(atEdge(l, i) && (repeated.has(l.text.toLowerCase().replace(/\d+/g, '#')) || /^\d{1,4}$/.test(l.text))),
    )
    if (!lines.length) continue

    // 表格：连续出现多栏的行。表格区域 = 第一行多栏 ~ 最后一行多栏（中间夹着的单栏行是跨行的单元格），
    // 上方（如章节标题）和下方的行仍按普通段落处理
    // 正文分栏（双栏论文等）：先拆成“左栏所有行 + 右栏所有行”，再按普通段落处理
    if (lines.filter((l) => l.cells.length > 1).length >= 3 && looksLikeTextColumns(lines)) lines = columnsToLines(lines)
    const multiIdx = lines.map((l, i) => (l.cells.length > 1 ? i : -1)).filter((i) => i >= 0)
    let tableRange = null
    if (multiIdx.length >= 3) {
      tableRange = [multiIdx[0], multiIdx.at(-1)]
      // 最后一行单元格的文字可能折到下一行（只有右栏有字）：继续并入表格
      const rightX = Math.max(...lines[tableRange[1]].cells.map((c) => c.x))
      while (tableRange[1] + 1 < lines.length) {
        const next = lines[tableRange[1] + 1]
        const prev = lines[tableRange[1]]
        if (next.cells.length === 1 && Math.abs(next.cells[0].x - rightX) <= 2 && prev.y - next.y <= next.size * 1.8) tableRange[1]++
        else break
      }
    }

    // 这一页里，每种字号的典型行距（标题、正文、表格字号不同，行距也不同，要分开算）
    const gapsBySize = new Map()
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y
      if (lines[i].size === lines[i - 1].size && gap > 0) gapsBySize.set(lines[i].size, [...(gapsBySize.get(lines[i].size) ?? []), gap])
    }
    // 同一段里的行距上限：典型行距的 1.4 倍（样本太少时按字号估算）
    const maxGap = (size) => {
      const g = gapsBySize.get(size) ?? []
      const typical = g.length >= 2 ? Math.min(median(g), size * 1.8) : size * 1.5
      return typical * 1.4
    }
    // 正文字体：这一页正文字号的行里最常见的字体
    const bodyFont = mostCommon(
      lines.filter((l) => l.size === bodySize).reduce((m, l) => m.set(l.font, (m.get(l.font) ?? 0) + l.text.length), new Map()),
    )

    lines.forEach((line, i) => {
      if (tableRange && i >= tableRange[0] && i <= tableRange[1]) {
        if (i === tableRange[0]) {
          flush()
          const rows = tableToParagraphs(lines.slice(tableRange[0], tableRange[1] + 1))
          paragraphs.push(...rows)
          paraPages.push(...rows.map(() => pageIndex))
        }
        return
      }
      // 标题：字号明显更大；或者字体和正文不同（粗体）、比较短、不以句末标点结尾。编号列表项不算标题
      const isHeading =
        line.size > bodySize * 1.15 ||
        (line.font !== bodyFont && line.text.length < 100 && !SENTENCE_END.test(line.text) && !NUMBERED.test(line.text))
      const first = i === 0
      const gap = first ? null : lines[i - 1].y - line.y
      const continues =
        current &&
        current.size === line.size &&
        current.heading === isHeading &&
        !BULLET.test(line.text) &&
        !NUMBERED.test(line.text) &&
        !ANSWER.test(line.text) &&
        // 同一页：行距正常；跨页：上一段没结束，且这一行以小写开头
        (first ? !SENTENCE_END.test(current.text) && /^[a-z]/.test(line.text) : gap <= maxGap(line.size))

      // 单独一行的编号或编号标签（“1.”、“3.Question”）：并到下一行开头
      if (current && !current.heading && NUMBERED.test(current.text) && current.text.length < 16) {
        current.text += ' ' + line.text
        current.heading = false // 编号列表项不是标题（否则题目最后一行和前面会因为“是否标题”不同被拆开）
      } else if (continues) {
        current.text = appendLine(current.text, line.text)
      } else {
        flush()
        current = { text: line.text, size: line.size, font: line.font, heading: isHeading, page: pageIndex }
      }
    })
  }
  flush()
  return { paragraphs, paraPages, bodySize, pageStarts }
}
