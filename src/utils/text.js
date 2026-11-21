// 文本工具：在原句里查找完整单词（复习卡片高亮、词汇库判断残缺词共用）

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 在 context 里找 word 作为“完整单词”出现的位置（忽略大小写），返回 RegExp 匹配结果或 null */
export function findWholeWord(context, word) {
  if (!context || !word) return null
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, 'iu').exec(context)
}

/**
 * 在原句里找到这个词，切成 [前文, 原词, 后文]，用于在原句里高亮它。
 * 找不到，或者标记的就是整句（几乎占满原句）时返回 null。
 */
export function splitContext(context, word) {
  if (!context || word.length > context.length * 0.6) return null
  const m = findWholeWord(context, word)
  if (!m) return null
  return [context.slice(0, m.index), m[0], context.slice(m.index + m[0].length)]
}

/**
 * 疑似残缺：只选了半个词就标记了（例如原句里是 perspectives，存的却是 perspecti）。
 * 判断方法：这个词在它自己的原句里找不到“完整单词”的匹配，但能找到作为某个单词一部分的匹配。
 */
export function isLikelyFragment(word, context) {
  if (!context || !word || /\s/.test(word)) return false
  return !findWholeWord(context, word) && context.toLowerCase().includes(word.toLowerCase())
}
