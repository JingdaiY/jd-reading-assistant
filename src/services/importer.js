// 导入阅读材料：粘贴的文本、TXT 文件、EPUB 电子书 → { title, author, chapters: [{ title, paragraphs }] }
// 全部在浏览器本地解析，文件不会上传到任何地方。

const MAX_FILE_BYTES = 30 * 1024 * 1024 // 30 MB
const PARAGRAPHS_PER_PART = 60 // 没有章节标题的长文本，按这个段落数自动分段

// "Chapter 1" / "CHAPTER XII. The Return" / "Part Two" / "Book III" 这类章节标题
const CHAPTER_HEADING = /^(chapter|book|part|section|letter)\s+([0-9]+|[ivxlcdm]+|[a-z]+(-[a-z]+)?)\b[\s.:—-]*.{0,60}$/i

const clean = (s) => s.replace(/\s+/g, ' ').trim()

/** 纯文本 → 段落：按空行切分，并把段落内的硬换行接回成一行（Gutenberg 的 TXT 每 70 字符就换行） */
function toParagraphs(text) {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ')
  let blocks = normalized.split(/\n\s*\n/)
  // 整篇几乎没有空行（每行就是一段）：改为按单个换行切分
  if (blocks.length <= 2 && normalized.split('\n').length > 5) blocks = normalized.split('\n')
  return blocks.map(clean).filter(Boolean)
}

/** 段落 → 章节：识别章节标题；识别不到又太长时，自动分成若干部分 */
function toChapters(paragraphs) {
  const chapters = []
  let current = { title: null, paragraphs: [] }
  for (const p of paragraphs) {
    if (p.length < 80 && CHAPTER_HEADING.test(p)) {
      if (current.paragraphs.length || current.title) chapters.push(current)
      current = { title: p, paragraphs: [] }
    } else {
      current.paragraphs.push(p)
    }
  }
  chapters.push(current)
  let nonEmpty = chapters.filter((c) => c.paragraphs.length)

  // 第一个章节标题之前只有很短的几行（通常是书名、作者）：当作扉页，不算一章
  let front = null
  const first = nonEmpty[0]
  if (nonEmpty.length > 1 && !first.title && first.paragraphs.length <= 3 && first.paragraphs.join(' ').length < 300) {
    front = first.paragraphs
    nonEmpty = nonEmpty.slice(1)
  }
  if (nonEmpty.length > 1) return { chapters: nonEmpty, front }
  const all = nonEmpty[0]?.paragraphs ?? []
  if (all.length <= PARAGRAPHS_PER_PART * 2) return { chapters: [{ title: nonEmpty[0]?.title ?? null, paragraphs: all }], front }
  const parts = []
  for (let i = 0; i < all.length; i += PARAGRAPHS_PER_PART) {
    parts.push({ title: `第 ${parts.length + 1} 部分`, paragraphs: all.slice(i, i + PARAGRAPHS_PER_PART) })
  }
  return { chapters: parts, front }
}

/** Project Gutenberg 的 TXT 正文前后有大段英文版权声明，只保留 START / END 标记之间的正文 */
function stripGutenberg(text) {
  const start = text.search(/\*{3}\s*START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i)
  const end = text.search(/\*{3}\s*END OF (THE|THIS) PROJECT GUTENBERG/i)
  if (start < 0) return text
  const body = text.slice(text.indexOf('\n', start) + 1, end > start ? end : undefined)
  return body
}

/**
 * 粘贴的文本 / TXT 文件。
 * title：粘贴时用户填的标题，或 TXT 的文件名（fallbackTitle=true，扉页里有书名时优先用书名）
 */
export function parseText(text, title, { fallbackTitle = false } = {}) {
  const paragraphs = toParagraphs(stripGutenberg(text))
  if (!paragraphs.length) throw new Error('没有识别到任何文字')
  const { chapters, front } = toChapters(paragraphs)
  const frontTitle = front?.[0]?.slice(0, 80)
  const chosen = fallbackTitle ? frontTitle || title : title?.trim() || frontTitle
  return { title: chosen || paragraphs[0].slice(0, 60), author: null, chapters }
}

// ---------------- EPUB ----------------

const parseXml = (str, type = 'application/xml') => new DOMParser().parseFromString(str, type)
const byTag = (doc, tag) => [...doc.getElementsByTagNameNS('*', tag)]

/** 相对路径 → zip 里的完整路径（处理 ../ 和 URL 编码） */
function resolvePath(base, href) {
  const parts = (base ? base.split('/') : []).concat(decodeURIComponent(href.split('#')[0]).split('/'))
  const out = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return out.join('/')
}

// 正文块元素；只取“最内层”的那一级，避免 <li><p>…</p></li> 被重复提取
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre'

function extractBlocks(html) {
  let doc = parseXml(html, 'application/xhtml+xml')
  if (doc.getElementsByTagName('parsererror').length) doc = parseXml(html, 'text/html')
  const body = doc.body ?? doc.getElementsByTagNameNS('*', 'body')[0]
  if (!body) return { heading: null, paragraphs: [] }

  const blocks = [...body.querySelectorAll(BLOCK_SELECTOR)].filter((el) => !el.querySelector(BLOCK_SELECTOR))
  let paragraphs = blocks.map((el) => clean(el.textContent)).filter(Boolean)
  // 有些电子书全用 <div> 排版：退回按换行切分整个正文
  if (!paragraphs.length) paragraphs = toParagraphs(body.textContent)

  const headingEl = body.querySelector('h1, h2, h3')
  const heading = headingEl ? clean(headingEl.textContent) : null
  // 标题已经作为章节名显示了，正文里就不再重复
  if (heading && paragraphs[0] === heading) paragraphs = paragraphs.slice(1)
  return { heading, paragraphs }
}

/** EPUB 是一个 zip 包：META-INF/container.xml → OPF（元数据 + 阅读顺序 spine）→ 各章 XHTML */
export async function parseEpub(file) {
  const { default: JSZip } = await import('jszip') // 按需加载，不拖慢首屏
  let zip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('无法打开这个文件，它可能不是有效的 EPUB')
  }

  const containerXml = await zip.file('META-INF/container.xml')?.async('string')
  if (!containerXml) throw new Error('不是有效的 EPUB（缺少 META-INF/container.xml）')
  const opfPath = byTag(parseXml(containerXml), 'rootfile')[0]?.getAttribute('full-path')
  const opfXml = opfPath && (await zip.file(opfPath)?.async('string'))
  if (!opfXml) throw new Error('不是有效的 EPUB（找不到内容清单）')

  // DRM 检测：encryption.xml 里如果有正文文件被加密，就无法读取（只有字体被混淆则不影响）
  const encryptionXml = await zip.file('META-INF/encryption.xml')?.async('string')
  if (encryptionXml) {
    const encrypted = byTag(parseXml(encryptionXml), 'CipherReference').map((el) => el.getAttribute('URI') ?? '')
    if (encrypted.some((uri) => /\.(x?html?|xml)$/i.test(uri))) {
      throw new Error('这本 EPUB 受 DRM 版权保护，无法导入。只支持没有 DRM 的电子书（例如 Project Gutenberg 的公版书）')
    }
  }

  const opf = parseXml(opfXml)
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : ''
  const title = clean(byTag(opf, 'title')[0]?.textContent ?? '') || file.name.replace(/\.epub$/i, '')
  const author = clean(byTag(opf, 'creator')[0]?.textContent ?? '') || null

  const manifest = new Map(
    byTag(opf, 'item').map((el) => [
      el.getAttribute('id'),
      { href: el.getAttribute('href'), type: el.getAttribute('media-type'), props: el.getAttribute('properties') ?? '' },
    ]),
  )
  const spine = byTag(opf, 'itemref').map((el) => manifest.get(el.getAttribute('idref'))).filter(Boolean)

  const chapters = []
  for (const item of spine) {
    if (!/html|xml/.test(item.type ?? '') || item.props.includes('nav')) continue
    const html = await zip.file(resolvePath(baseDir, item.href))?.async('string')
    if (!html) continue
    const { heading, paragraphs } = extractBlocks(html)
    if (paragraphs.length) chapters.push({ title: heading, paragraphs })
  }
  if (!chapters.length) throw new Error('没有在这本 EPUB 里找到正文')
  return { title, author, chapters }
}

/** 根据文件类型导入 */
export async function parseFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('文件太大（超过 30 MB）')
  const name = file.name.toLowerCase()
  if (name.endsWith('.epub')) return { ...(await parseEpub(file)), kind: 'epub' }
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    return { ...parseText(await file.text(), file.name.replace(/\.[^.]+$/, ''), { fallbackTitle: true }), kind: 'txt' }
  }
  throw new Error('只支持 .txt 和 .epub 文件')
}
