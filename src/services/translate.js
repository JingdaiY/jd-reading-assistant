import { useEffect, useState } from 'react'
import { modeLabel, useSettings } from '../settings'
import { aiLookup } from './ai'
import { dictionaryLookup } from './dictionary'

// 查询结果缓存：同一模式下重复划同一个词不再发请求（刷新页面后清空）
const cache = new Map()

const cacheKey = (text, context, settings) =>
  settings.mode === 'ai'
    ? `ai:${settings.provider}:${settings.models[settings.provider]}:${text}:${context}` // AI 结果和语境有关
    : `dict:${text.toLowerCase()}`

/**
 * 根据当前模式查询释义。返回：
 * { isWord, phonetic, pos, translation（可能多行，每行一个词性）, note（如“atrophy 的变形”）, etymology, via（辞典模式下的具体来源）}
 */
export async function lookup(text, context, settings, { signal } = {}) {
  const key = cacheKey(text, context, settings)
  if (cache.has(key)) return cache.get(key)
  const result =
    settings.mode === 'ai' ? await aiLookup(text, context, settings, { signal }) : await dictionaryLookup(text, { signal })
  cache.set(key, result)
  return result
}

/** React hook：选区变化时自动查询，组件卸载（气泡关闭）时取消请求 */
export function useLookup(text, context) {
  const settings = useSettings()
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    lookup(text, context, settings, { signal: controller.signal })
      .then((data) => setState({ status: 'done', data, error: null }))
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ status: 'error', data: null, error: err.message || '查询失败' })
      })
    return () => controller.abort()
  }, [text, context, settings])

  return { ...state, source: modeLabel(settings) }
}
