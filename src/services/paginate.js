// 长章节分页：按段落边界切成若干页，每页约 WORDS_PER_PAGE 个词。
// 不会把一个段落切开；单个段落本身就超长时，它自己单独成一页。
// 分页只在显示时计算（不存数据库），以后调整每页字数也不影响已保存的数据。

export const WORDS_PER_PAGE = 1800

const IMAGE_WORDS = 80 // 一张插图大约占多少个词的版面
const countWords = (p) => (typeof p === 'string' ? p.split(/\s+/).filter(Boolean).length : IMAGE_WORDS)

/** 段落数组 → 页数组（每页是一组段落；段落可以是文字，也可以是插图对象） */
export function paginate(paragraphs, wordsPerPage = WORDS_PER_PAGE) {
  const pages = []
  let current = []
  let words = 0
  for (const p of paragraphs) {
    const n = countWords(p)
    // 当前页已经有内容，再加这一段就超出：先结束当前页
    if (current.length && words + n > wordsPerPage) {
      pages.push(current)
      current = []
      words = 0
    }
    current.push(p)
    words += n
  }
  if (current.length || !pages.length) pages.push(current)
  return pages
}
