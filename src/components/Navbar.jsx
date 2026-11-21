import { useRef, useState } from 'react'
import { exportWords, importWords } from '../db/backup'
import { formatAgo, getBackupStatus, getLastBackupAt } from '../db/backupReminder'
import { usePopover } from '../hooks/usePopover'
import ModeMenu from './ModeMenu'

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-[18px]">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.3 4.32c.43-1.76 2.93-1.76 3.35 0a1.72 1.72 0 0 0 2.58 1.06c1.54-.94 3.3.83 2.37 2.37a1.72 1.72 0 0 0 1.06 2.57c1.76.43 1.76 2.93 0 3.36a1.72 1.72 0 0 0-1.06 2.57c.94 1.54-.83 3.3-2.37 2.37a1.72 1.72 0 0 0-2.57 1.06c-.43 1.76-2.93 1.76-3.36 0a1.72 1.72 0 0 0-2.57-1.06c-1.54.94-3.3-.83-2.37-2.37a1.72 1.72 0 0 0-1.06-2.57c-1.76-.43-1.76-2.93 0-3.36a1.72 1.72 0 0 0 1.06-2.57c-.94-1.54.83-3.3 2.37-2.37 1 .6 2.3.07 2.57-1.06Z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function MenuItem({ children, hint, ...props }) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100"
      {...props}
    >
      {children}
      {hint && <span className="text-xs text-stone-400">{hint}</span>}
    </button>
  )
}

function NavLink({ href, active, children }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm whitespace-nowrap outline-none sm:px-2.5 transition-colors hover:bg-stone-100 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-stone-300 ${
        active ? 'text-stone-900' : 'text-stone-500'
      }`}
    >
      {children}
    </a>
  )
}

export default function Navbar({ words, dueCount, route }) {
  const { open, setOpen, ref: menuRef } = usePopover()
  const [lastBackupAt, setLastBackupAt] = useState(getLastBackupAt)
  const backup = getBackupStatus(words, lastBackupAt)
  const [message, setMessage] = useState(null) // { type: 'ok' | 'error', text }
  const fileRef = useRef(null)

  const handleExport = async () => {
    const n = await exportWords()
    setLastBackupAt(getLastBackupAt())
    setMessage({ type: 'ok', text: `已导出 ${n} 个生词` })
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 清空，保证同一个文件可以重复选择
    if (!file) return
    try {
      const { added, skipped } = await importWords(file)
      setLastBackupAt(getLastBackupAt())
      setMessage({ type: 'ok', text: `导入 ${added} 个${skipped ? `，跳过 ${skipped} 个重复/无效` : ''}` })
    } catch (err) {
      setMessage({ type: 'error', text: `导入失败：${err.message}` })
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-stone-200/60 bg-paper/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <a href="#/" className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-ink text-xs font-semibold tracking-tight text-paper">
            JD
          </span>
          {/* 手机上只留 Logo 方块，给导航项腾地方 */}
          <span className="hidden text-sm font-medium tracking-tight text-stone-700 sm:inline">Reading Assistant</span>
        </a>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <NavLink href="#/help" active={route === 'help'}>
            帮助
          </NavLink>
          <NavLink href="#/" active={route !== 'review' && route !== 'help'}>
            阅读
          </NavLink>
          <NavLink href="#/review" active={route === 'review'}>
            <span className="sm:hidden">复习</span>
            <span className="hidden sm:inline">每日复习</span>
            {dueCount > 0 && (
              <span className="min-w-5 rounded-full bg-ink px-1.5 py-px text-center text-[11px] font-medium text-white">
                {dueCount}
              </span>
            )}
          </NavLink>
          <ModeMenu />
          <span className="mx-1 h-4 w-px bg-stone-200 sm:mx-1.5" />

        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label={backup.needsBackup ? '设置（有生词未备份）' : '设置'}
            aria-expanded={open}
            title={backup.needsBackup ? `有 ${backup.unsavedCount} 个生词未备份` : '设置'}
            onClick={() => {
              setOpen((v) => !v)
              setMessage(null)
            }}
            className={`relative rounded-md p-2 transition-colors hover:bg-stone-100 hover:text-stone-700 ${
              open ? 'bg-stone-100 text-stone-700' : 'text-stone-400'
            }`}
          >
            <GearIcon />
            {/* 备份提醒小圆点 */}
            {backup.needsBackup && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500 ring-2 ring-paper" />
            )}
          </button>

          {open && (
            <div
              role="menu"
              className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 origin-top-right animate-pop sm:w-64 rounded-xl border border-stone-200/80 bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            >
              <div className="flex items-baseline justify-between px-2.5 pt-1.5 pb-2 text-[11px] text-stone-400">
                <span className="font-medium tracking-wide uppercase">生词本 · {words.length} 个</span>
                <span>上次备份：{formatAgo(lastBackupAt)}</span>
              </div>

              {backup.needsBackup && (
                <div className="mx-1 mb-1 rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-800">
                  有 {backup.unsavedCount} 个生词还没备份，建议导出一份，以防清除浏览器数据后丢失。
                </div>
              )}

              <MenuItem onClick={handleExport} hint=".json">
                导出备份
              </MenuItem>
              <MenuItem onClick={() => fileRef.current?.click()} hint="合并">
                从备份导入
              </MenuItem>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />

              {message && (
                <p
                  className={`mx-1 mt-1.5 rounded-md px-2 py-1.5 text-xs ${
                    message.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}
                >
                  {message.text}
                </p>
              )}
            </div>
          )}
        </div>
        </div>
      </nav>
    </header>
  )
}
