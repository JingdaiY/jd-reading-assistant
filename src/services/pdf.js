// PDF 导入：用 Mozilla 的 pdf.js（Apache-2.0）在浏览器里提取文字，再用 pdfLayout 还原段落。
// 文件不会上传；pdf.js 和它的 worker 都是按需加载，只有导入 PDF 时才下载。
import { toChapters } from './importer'
import { layoutToParagraphs } from './pdfLayout'

const MIN_CHARS_PER_PAGE = 25 // 平均每页文字少于这个数 → 基本是图片（扫描版）

/**
 * PDF 元数据里的标题经常是无意义的（“about:blank”、“Untitled”、“Microsoft Word - 报告.docx”）：
 * 清理掉软件前缀和扩展名，清理后仍无意义就返回 null（改用文件名）
 */
function cleanTitle(raw) {
  const t = raw
    ?.trim()
    .replace(/^microsoft (word|powerpoint) - /i, '')
    .replace(/\.(docx?|pptx?|pdf|txt|html?)$/i, '')
    .trim()
  if (!t || /^(about:blank|untitled|document\d*|new document|unknown)$/i.test(t) || /^https?:\/\//.test(t)) return null
  return t
}

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/** PDF 自带的书签目录（顶层条目）→ [{ title, page }]，按页码排序；解析不了的条目跳过 */
async function readOutline(doc) {
  const outline = await doc.getOutline().catch(() => null)
  if (!outline?.length) return []
  const entries = []
  for (const item of outline) {
    try {
      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
      if (!dest?.[0]) continue
      const page = await doc.getPageIndex(dest[0])
      if (item.title?.trim()) entries.push({ title: item.title.trim(), page })
    } catch {
      // 书签指向的位置无效：忽略这一条
    }
  }
  return entries.sort((a, b) => a.page - b.page)
}

/**
 * toChapters 只返回分好章的段落；按顺序把它们对回原来的段落列表，给每段补上原 PDF 页码
 * （章节标题那一段被用作章名，不在正文里，顺序比对时会自然跳过）
 */
function withPageNumbers(chapters, paragraphs, paraPages) {
  let k = 0
  return chapters.map((c) => ({
    ...c,
    pages: c.paragraphs.map((p) => {
      while (k < paragraphs.length && paragraphs[k] !== p) k++
      return paraPages[k++] ?? 0
    }),
  }))
}

/**
 * 解析 PDF → { title, author, chapters }（每章带 pages：每段在原 PDF 里的页码）
 * onProgress(done, total)：逐页提取文字时报告进度（几百页的书需要几秒）
 */
export async function parsePdf(file, { onProgress } = {}) {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 })
  let doc
  try {
    doc = await task.promise
  } catch (err) {
    if (err?.name === 'PasswordException') throw new Error('这个 PDF 有密码保护，无法导入')
    throw new Error('无法打开这个文件，它可能不是有效的 PDF')
  }

  // 逐页提取：每个文字片段的内容、坐标、字号、字体
  const pages = []
  let chars = 0
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const items = content.items
      .filter((it) => 'str' in it)
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        size: Math.round(Math.hypot(it.transform[2], it.transform[3]) * 10) / 10,
        font: it.fontName,
        width: it.width,
      }))
    chars += items.reduce((sum, it) => sum + it.str.trim().length, 0)
    pages.push({ height: page.view[3], items })
    page.cleanup()
    onProgress?.(n, doc.numPages)
  }
  if (chars / doc.numPages < MIN_CHARS_PER_PAGE) {
    throw new Error('这个 PDF 几乎没有可提取的文字，可能是扫描版（内容是图片），暂不支持')
  }

  const meta = await doc.getMetadata().catch(() => null)
  const title = cleanTitle(meta?.info?.Title) || file.name.replace(/\.pdf$/i, '')
  const author = meta?.info?.Author?.trim() || null

  // 有书签目录：按书签分章（最可靠）；否则按段落里的章节标题分章
  const outline = await readOutline(doc)
  let chapters
  if (outline.length >= 2) {
    const starts = outline.map((o) => o.page)
    const { paragraphs, paraPages, pageStarts } = layoutToParagraphs(pages, { breakPages: new Set(starts) })
    const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    chapters = outline
      .map((o, i) => {
        const from = pageStarts.get(o.page)
        const to = i + 1 < outline.length ? pageStarts.get(outline[i + 1].page) : undefined
        const body = paragraphs.slice(from, to)
        const bodyPages = paraPages.slice(from, to)
        // 章节标题已经作为章节名显示，正文开头那一行同样的标题就不再重复（只在前几段里找）
        const dup = body.slice(0, 4).findIndex((p) => norm(p) === norm(o.title))
        const keep = (_, j) => j !== dup
        return { title: o.title, paragraphs: body.filter(keep), pages: bodyPages.filter(keep) }
      })
      .filter((c) => c.paragraphs.length)
    // 第一个书签之前的内容（封面、版权页等）作为「开头」
    const firstStart = pageStarts.get(outline[0].page)
    if (firstStart > 0) chapters.unshift({ title: '开头', paragraphs: paragraphs.slice(0, firstStart), pages: paraPages.slice(0, firstStart) })
  }
  if (!chapters?.length) {
    const { paragraphs, paraPages } = layoutToParagraphs(pages)
    chapters = withPageNumbers(toChapters(paragraphs).chapters, paragraphs, paraPages)
  }
  await task.destroy() // 释放 worker 和内存
  if (!chapters.some((c) => c.paragraphs.length)) throw new Error('没有在这个 PDF 里找到正文')
  return { title, author, chapters }
}
