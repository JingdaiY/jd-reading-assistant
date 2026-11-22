// 阅读时给段落分类，用不同样式显示，让小标题、列表、表格行、问答一眼能分清。
// 导入时（尤其 PDF）原书的层次被压平成了普通段落；这里在显示时按规则识别回来，
// 已经导入的书无需重新导入就能生效。
//
// 重要：分类结果里的各部分（marker / label / body）拼起来必须和原文一字不差，
// 只是给其中一部分加粗或缩进——这样划词、提取原句、高亮都不受影响。
//
// 返回 { kind, marker, label, body }：
//   heading   小标题             body = 原文
//   question  问答里的问题       marker = “1.”，body = 其余（整句加粗）
//   answer    问答里的回答       label = “Answer:”，body = 其余
//   numbered  编号列表项         marker = “1.”，label = 冒号前的小标题（可能为空），body = 其余
//   bullet    圆点列表项         marker = “- ”，label / body 同上
//   labeled   “小标题：内容”     label = 冒号前（含冒号），body = 其余（PDF 表格行就是这种格式）
//   text      普通段落           body = 原文

const QUESTION = /^(\d{1,3}[.)]\s*)(question\b.*)$/is
const ANSWER = /^((?:answer|a)\s*[:：]\s*)(.*)$/is
const NUMBERED = /^(\d{1,3}[.)](?:\s+|(?=[A-Z])))(.+)$/s
const BULLET = /^([-•·▪◦–*]\s+)(.+)$/s
// 列表项里开头的“小标题:”：不太长、不含句号，冒号后面还有内容
const LEAD_LABEL = /^([^.:：!?]{2,60}[:：])(\s*\S.*)$/s
// PDF 表格行：“小标题：内容”（全角冒号是导入时插入的分隔符）
const TABLE_ROW = /^([^：]{1,80}：)(.+)$/s

/** 短、没有句末标点、以大写字母或数字开头 → 小标题 */
function looksLikeHeading(text) {
  if (text.length > 80 || text.split(/\s+/).length > 12) return false
  if (/[.!?;:,，。！？；"”’)\]…-]$/.test(text)) return false
  if (/\.\s/.test(text)) return false // 中间有句号：是句子不是标题
  return /^[A-Z0-9“"‘']/.test(text)
}

function splitLabel(rest) {
  const m = LEAD_LABEL.exec(rest)
  return m ? { label: m[1], body: m[2] } : { label: '', body: rest }
}

export function classifyParagraph(text) {
  let m
  if ((m = QUESTION.exec(text))) return { kind: 'question', marker: m[1], label: '', body: m[2] }
  if ((m = ANSWER.exec(text))) return { kind: 'answer', marker: '', label: m[1], body: m[2] }
  if ((m = NUMBERED.exec(text))) return { kind: 'numbered', marker: m[1], ...splitLabel(m[2]) }
  if ((m = BULLET.exec(text))) return { kind: 'bullet', marker: m[1], ...splitLabel(m[2]) }
  if ((m = TABLE_ROW.exec(text))) return { kind: 'labeled', marker: '', label: m[1], body: m[2] }
  if (looksLikeHeading(text)) return { kind: 'heading', marker: '', label: '', body: text }
  return { kind: 'text', marker: '', label: '', body: text }
}
