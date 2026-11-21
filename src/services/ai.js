// AI Agent 模式：BYOK，浏览器直连服务商（三家都支持跨域调用）。
// 把选中的文本和它所在的原句一起发给模型，要求严格返回 JSON。

const SYSTEM_PROMPT = `你是一个英语阅读助手。用户会给出一段英文"选中内容"以及它所在的"原句"。
请结合原句语境，只返回一个 JSON 对象，不要输出任何其他文字，格式如下：
{
  "phonetic": "选中内容是单个单词时给出美式 IPA 音标，如 /juːˈbɪkwɪtəs/；否则为 null",
  "pos": "单个单词时给出它在原句中的词性缩写，如 n. v. adj. adv.；否则为 null",
  "translation": "选中内容在该语境下简洁准确的中文释义；如果是句子，给出整句的中文翻译",
  "etymology": "单个单词且有清晰词根时给出词根拆解，如 ubi (到处) + quit (存在) + ous (形容词后缀)；否则为 null"
}`

const userPrompt = (text, context) => `选中内容：${text}\n原句：${context || text}`

/** 从模型回复中取出 JSON（兼容模型偶尔包了 ```json 代码块或多余文字的情况） */
function parseJson(raw) {
  const match = raw?.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('模型没有返回 JSON')
  try {
    return JSON.parse(match[0])
  } catch {
    throw new Error('模型返回的 JSON 格式有误')
  }
}

async function request(url, options, signal, providerLabel) {
  let res
  try {
    res = await fetch(url, { ...options, signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    // fetch 直接失败：网络不通，或者服务商的响应没带跨域头被浏览器拦下。
    // 豆包（火山方舟）在 Key / 模型错误时返回的 401/404 不带跨域头，浏览器读不到错误详情，只能走到这里
    throw new Error(
      providerLabel === '豆包'
        ? '无法读取豆包的返回：最常见的原因是 API Key 或模型 ID 不正确（豆包出错时不允许浏览器读取错误详情），也可能是网络问题'
        : `无法连接到 ${providerLabel}，请检查网络`,
    )
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message = body?.error?.message || ''
    // Gemini 的 Key 无效时返回 400 + "API key not valid"
    if (res.status === 401 || res.status === 403 || /api key/i.test(message)) throw new Error('API Key 无效或没有权限')
    if (res.status === 404) throw new Error('模型不存在，请检查模型名称')
    if (res.status === 429) throw new Error('请求太频繁或额度不足')
    throw new Error(message || `请求失败（HTTP ${res.status}）`)
  }
  return body
}

// OpenAI 和豆包（火山方舟）都是 OpenAI 兼容的 chat/completions 接口
async function chatCompletions(url, { key, model, text, context, jsonMode, label }, signal) {
  const body = await request(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(text, context) },
        ],
        ...(jsonMode && { response_format: { type: 'json_object' } }),
      }),
    },
    signal,
    label,
  )
  return body?.choices?.[0]?.message?.content
}

async function gemini({ key, model, text, context }, signal) {
  const body = await request(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt(text, context) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
      }),
    },
    signal,
    'Gemini',
  )
  return body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
}

export async function aiLookup(text, context, settings, { signal } = {}) {
  const provider = settings.provider
  const key = settings.keys[provider]?.trim()
  const model = settings.models[provider]?.trim()
  if (!key) throw new Error('还没有填写 API Key，请在顶部「模式」中设置')
  if (!model) throw new Error('还没有填写模型名称，请在顶部「模式」中设置')

  const args = { key, model, text, context }
  let raw
  if (provider === 'openai') {
    raw = await chatCompletions('https://api.openai.com/v1/chat/completions', { ...args, jsonMode: true, label: 'OpenAI' }, signal)
  } else if (provider === 'doubao') {
    raw = await chatCompletions('https://ark.cn-beijing.volces.com/api/v3/chat/completions', { ...args, label: '豆包' }, signal)
  } else {
    raw = await gemini(args, signal)
  }

  const data = parseJson(raw)
  const isWord = !/\s/.test(text)
  return {
    isWord,
    phonetic: isWord ? data.phonetic || null : null,
    pos: isWord ? data.pos || null : null,
    translation: data.translation || null,
    note: null,
    etymology: isWord ? data.etymology || null : null,
    via: null,
  }
}
