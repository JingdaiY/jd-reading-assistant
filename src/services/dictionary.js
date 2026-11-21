// 常规辞典模式
// - 单词 / 词组：内置 ECDICT 常用词词典（public/dict/ecdict-common.json，5.8 万词，MIT 许可），
//   首次查词时下载一次（约 1.7 MB），之后由浏览器缓存；能通过词形变化找到原形（atrophies → atrophy）
// - 词典里没有的词、以及整句：MyMemory 机器翻译（免费，匿名每天约 5000 字符额度）

const DICT_URL = `${import.meta.env.BASE_URL}dict/ecdict-common.json`

let dictPromise = null

/** 懒加载词典：整个页面生命周期只下载 / 解析一次 */
function loadDict() {
  dictPromise ??= fetch(DICT_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`词典加载失败（HTTP ${res.status}）`)
      return res.json()
    })
    .catch((err) => {
      dictPromise = null // 失败了允许下次重试
      throw err
    })
  return dictPromise
}

/** 在词典里查：先查原词，再查词形变化对应的原形。返回 { entry, lemma } 或 null */
function findInDict(dict, text) {
  const key = text.toLowerCase()
  if (dict.words[key]) return { entry: dict.words[key], lemma: null }
  const lemma = dict.forms[key]
  if (lemma && dict.words[lemma]) return { entry: dict.words[lemma], lemma }
  return null
}

const CJK = /[一-鿿]/
const normalize = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim()

/**
 * MyMemory 的结果来自大量网友提交的翻译记忆，排第一的不一定靠谱（比如 endless 会返回一整句无关的话）。
 * 对单词 / 短词组，从候选里挑：原文与查询完全一致、译文含中文、没有乱码、长度像个词而不是一句话，
 * 再按匹配度和质量分排序。整句直接用它的首选结果。
 */
function pickTranslation(data, text) {
  const isSentence = text.split(/\s+/).length > 4
  if (isSentence) return data?.responseData?.translatedText

  const maxLen = Math.max(12, text.length)
  const candidates = [
    ...(data?.matches ?? []),
    { segment: text, translation: data?.responseData?.translatedText, match: 0, quality: 0 },
  ].filter(
    (m) =>
      m.translation &&
      normalize(m.segment ?? '') === normalize(text) &&
      CJK.test(m.translation) &&
      !/&#|[。！？]/.test(m.translation) &&
      m.translation.length <= maxLen,
  )
  candidates.sort((a, b) => b.match - a.match || (Number(b.quality) || 0) - (Number(a.quality) || 0))
  return candidates[0]?.translation ?? null
}

async function machineTranslate(text, signal) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|zh-CN`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`翻译服务出错（HTTP ${res.status}）`)
  const data = await res.json()
  // 额度用完时 MyMemory 仍返回 200，但 responseStatus 是 429，或者译文是一段英文警告
  if (data?.responseStatus !== 200 || /MYMEMORY WARNING/i.test(data?.responseData?.translatedText ?? '')) {
    throw new Error('免费翻译额度已用完，明天再试，或切换到 AI Agent 模式')
  }
  return pickTranslation(data, text)
}

/** 阅读页打开时在后台预加载词典，这样第一次查词也不用等下载 */
export function preloadDictionary() {
  loadDict().catch(() => {})
}

export async function dictionaryLookup(text, { signal } = {}) {
  const isWord = !/\s/.test(text)
  const isSentence = text.split(/\s+/).length > 4

  if (!isSentence) {
    const hit = findInDict(await loadDict(), text)
    if (hit) {
      const [phonetic, translation] = hit.entry
      return {
        isWord,
        phonetic: isWord ? phonetic : null,
        // 词典释义每行自带词性（如 "vi. 逗留\nvt. 消磨"），所以不再单独给 pos
        pos: null,
        translation,
        // 查的是变形词时，告诉用户原形是什么
        note: hit.lemma ? `${hit.lemma} 的变形` : null,
        etymology: null,
        via: 'ECDICT',
      }
    }
  }

  const translation = await machineTranslate(text, signal)
  if (!translation) throw new Error('词典里没有这个词，机器翻译也没有给出可靠结果。可以试试 AI Agent 模式')
  return { isWord, phonetic: null, pos: null, translation, note: null, etymology: null, via: '机器翻译' }
}
