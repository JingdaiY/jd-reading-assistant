import { useState } from 'react'
import { usePopover } from '../hooks/usePopover'
import { aiLookup } from '../services/ai'
import { modeLabel, PROVIDERS, updateSettings, useSettings } from '../settings'

const MODES = [
  { id: 'dictionary', label: '常规辞典' },
  { id: 'ai', label: 'AI Agent' },
]

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-lg bg-stone-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
            value === o.id ? 'bg-white font-medium text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] leading-snug text-stone-400">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 font-mono text-base text-stone-800 sm:text-xs outline-none transition placeholder:font-sans placeholder:text-stone-300 focus:border-stone-400'

function AiSettings({ settings }) {
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState(null) // { status: 'loading' | 'ok' | 'error', text }
  const provider = settings.provider
  const meta = PROVIDERS[provider]

  const setKey = (v) => updateSettings({ keys: { ...settings.keys, [provider]: v } })
  const setModel = (v) => updateSettings({ models: { ...settings.models, [provider]: v } })

  const runTest = async () => {
    setTest({ status: 'loading', text: '正在测试…' })
    try {
      const r = await aiLookup('ubiquitous', 'Smartphones have become ubiquitous in our daily lives.', settings)
      setTest({ status: 'ok', text: `连接成功：ubiquitous → ${r.translation}` })
    } catch (err) {
      setTest({ status: 'error', text: err.message })
    }
  }

  return (
    <div className="space-y-3">
      <Segmented
        options={Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label }))}
        value={provider}
        onChange={(id) => {
          updateSettings({ provider: id })
          setTest(null)
        }}
      />

      <Field
        label="API Key"
        hint={
          <>
            只保存在本浏览器（localStorage），请求从浏览器直连 {meta.label}，按用量计费。建议使用设置了额度上限的 Key。{' '}
            <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="text-stone-500 underline hover:text-stone-800">
              获取 Key ↗
            </a>
          </>
        }
      >
        <div className="flex gap-1.5">
          <input
            type={showKey ? 'text' : 'password'}
            value={settings.keys[provider]}
            onChange={(e) => {
              setKey(e.target.value)
              setTest(null)
            }}
            placeholder={meta.keyHint}
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="shrink-0 rounded-md border border-stone-200 px-2 text-xs text-stone-500 hover:bg-stone-100"
          >
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>
      </Field>

      <Field label="模型" hint={meta.modelHint}>
        <input
          type="text"
          value={settings.models[provider]}
          onChange={(e) => {
            setModel(e.target.value)
            setTest(null)
          }}
          placeholder={meta.defaultModel || '必填'}
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={runTest}
          disabled={test?.status === 'loading'}
          className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700 disabled:bg-stone-300"
        >
          测试连接
        </button>
        <span className="text-[11px] text-stone-400">设置自动保存</span>
      </div>
      {test && (
        <p
          className={`rounded-md px-2.5 py-1.5 text-xs leading-relaxed ${
            test.status === 'ok'
              ? 'bg-emerald-50 text-emerald-700'
              : test.status === 'error'
                ? 'bg-rose-50 text-rose-600'
                : 'bg-stone-100 text-stone-500'
          }`}
        >
          {test.text}
        </p>
      )}
    </div>
  )
}

export default function ModeMenu() {
  const settings = useSettings()
  const { open, setOpen, ref } = usePopover()
  // AI 模式下当前服务商还没填 Key 或模型：在入口上显示橙点提醒
  const aiIncomplete =
    settings.mode === 'ai' && (!settings.keys[settings.provider]?.trim() || !settings.models[settings.provider]?.trim())

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm whitespace-nowrap outline-none max-[400px]:px-1.5 sm:px-2.5 transition-colors hover:bg-stone-100 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-stone-300 ${
          open ? 'bg-stone-100 text-stone-900' : 'text-stone-500'
        }`}
      >
        模式
        {/* 特别窄的屏幕（iPhone SE 等）上隐藏当前模式的小标签，避免导航栏挤不下 */}
        <span className="rounded bg-stone-100 px-1.5 py-px text-[11px] text-stone-500 max-[400px]:hidden">{modeLabel(settings)}</span>
        {aiIncomplete && <span className="absolute top-1 right-1 size-2 rounded-full bg-amber-500 ring-2 ring-paper" />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="查词模式"
          className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 origin-top-right animate-pop sm:w-80 space-y-4 rounded-xl border border-stone-200/80 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
        >
          <p className="text-[11px] font-medium tracking-wide text-stone-400 uppercase">查词模式</p>
          <Segmented options={MODES} value={settings.mode} onChange={(mode) => updateSettings({ mode })} />

          {settings.mode === 'dictionary' ? (
            <p className="text-xs leading-relaxed text-stone-500">
              免费，无需配置。单词和词组查内置的 ECDICT 英汉词典（5.8 万常用词，离线可用，能识别 atrophies → atrophy 这类变形）；
              词典里没有的词和整句用 MyMemory 机器翻译（每天约 5000 字符免费额度）。释义不结合上下文。
            </p>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-stone-500">
                把选中的词连同所在原句一起发给大模型，给出贴合语境的释义、词性、音标和词根。需要你自己的 API Key。
              </p>
              <AiSettings settings={settings} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
