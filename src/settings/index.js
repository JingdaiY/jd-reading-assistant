import { useSyncExternalStore } from 'react'

// 查词模式设置，存在 localStorage（BYOK：API Key 只保存在你自己的浏览器里，请求从浏览器直连服务商）

const STORAGE_KEY = 'jdra.settings'

export const PROVIDERS = {
  doubao: {
    label: '豆包',
    defaultModel: '',
    modelHint: '在火山方舟控制台复制模型 ID 或推理接入点 ID（ep-…）',
    keyHint: '火山方舟 API Key',
    keyUrl: 'https://console.volcengine.com/ark',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    modelHint: '例如 gpt-4o-mini',
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    label: 'Gemini',
    defaultModel: 'gemini-2.5-flash',
    modelHint: '例如 gemini-2.5-flash',
    keyHint: 'Google AI Studio API Key',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
}

const DEFAULTS = {
  mode: 'dictionary', // 'dictionary' 常规辞典 | 'ai' AI Agent
  provider: 'openai',
  // 每家服务商各存一份 Key 和模型，切换服务商时不会丢
  keys: { doubao: '', openai: '', gemini: '' },
  models: Object.fromEntries(Object.entries(PROVIDERS).map(([id, p]) => [id, p.defaultModel])),
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return {
      ...DEFAULTS,
      ...saved,
      keys: { ...DEFAULTS.keys, ...saved.keys },
      models: { ...DEFAULTS.models, ...saved.models },
    }
  } catch {
    return DEFAULTS
  }
}

// 一个极简的全局 store：所有组件通过 useSettings() 读取同一份设置，任何地方修改都会同步刷新
let current = load()
const listeners = new Set()

export function getSettings() {
  return current
}

export function updateSettings(patch) {
  current = { ...current, ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  listeners.forEach((fn) => fn())
}

export function useSettings() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getSettings,
  )
}

/** 当前模式的简短名称，用于导航栏和气泡里显示“由谁查询” */
export function modeLabel(settings) {
  return settings.mode === 'ai' ? PROVIDERS[settings.provider].label : '辞典'
}
