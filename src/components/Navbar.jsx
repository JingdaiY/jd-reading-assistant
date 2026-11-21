import { useEffect, useRef, useState } from 'react'
import { exportWords, importWords } from '../db/backup'
import { formatAgo, getBackupStatus, getLastBackupAt } from '../db/backupReminder'
import { usePopover } from '../hooks/usePopover'
import { connect, disconnect, downloadCloudFile, getCloudSummary, syncNow, useSyncState } from '../sync'
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

/** 云朵图标：未连接 = 空心；已同步 = 带勾；同步中 = 带箭头；需要处理 = 带感叹号 */
function CloudIcon({ status, connected }) {
  const mark = !connected
    ? null
    : status === 'syncing'
      ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0-5-2 2m2-2 2 2" />
      : status === 'expired' || status === 'error'
        ? <path strokeLinecap="round" d="M12 10.5v3m0 2.2v.1" />
        : <path strokeLinecap="round" strokeLinejoin="round" d="m9.5 13.5 1.8 1.8 3.4-3.6" />
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-[18px]">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.1 4.75 4.75 0 0 0 7 18.5Z" />
      {mark}
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

const SYNC_LABEL = { syncing: '同步中…', ok: '已同步', expired: '授权已过期', error: '同步出错' }

const formatBytes = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** 「查看云端数据」：读取 Drive 上的同步文件，和本机对比，可下载原始文件 */
function CloudPanel() {
  const [info, setInfo] = useState({ status: 'loading' })
  useEffect(() => {
    let alive = true
    getCloudSummary()
      .then((r) => alive && setInfo({ status: 'done', ...r }))
      .catch((err) => alive && setInfo({ status: 'error', error: err.message }))
    return () => {
      alive = false
    }
  }, [])

  if (info.status === 'loading') return <p className="mt-2.5 text-xs text-stone-400">正在读取云端数据…</p>
  if (info.status === 'error') return <p className="mt-2.5 text-xs text-rose-600">读取失败：{info.error}</p>
  const { cloud, local, raw } = info
  const same = cloud && cloud.words === local.words && cloud.articles === local.articles
  return (
    <div className="mt-2.5 rounded-md border border-stone-200 bg-white p-2.5 text-xs leading-relaxed text-stone-600">
      {cloud ? (
        <>
          <p>
            <span className="text-stone-400">云端：</span>
            {cloud.words} 个生词 · {cloud.articles} 篇文章
            {cloud.deletedWords > 0 && <span className="text-stone-400">（另有 {cloud.deletedWords} 条删除记录）</span>}
          </p>
          <p>
            <span className="text-stone-400">本机：</span>
            {local.words} 个生词 · {local.articles} 篇文章
          </p>
          <p className="mt-1 text-stone-400">
            {cloud.updatedAt && `云端更新于 ${new Date(cloud.updatedAt).toLocaleString()} · `}文件大小 {formatBytes(cloud.bytes)}
          </p>
          <p className={`mt-1 ${same ? 'text-emerald-600' : 'text-amber-600'}`}>
            {same ? '✓ 本机和云端一致' : '本机和云端数量不同：点「立即同步」后再查看'}
          </p>
          <button type="button" onClick={() => downloadCloudFile(raw)} className="mt-2 text-stone-500 underline hover:text-stone-800">
            下载云端原始文件（.json）
          </button>
        </>
      ) : (
        <p>云端还没有同步文件，点「立即同步」上传本机数据。</p>
      )}
    </div>
  )
}

/** ⚙️ 菜单里的 Google Drive 同步区域 */
function SyncSection({ sync }) {
  const [showCloud, setShowCloud] = useState(false)
  const smallBtn = 'rounded-md px-2.5 py-1.5 text-xs font-medium transition active:scale-95'
  if (!sync.connected) {
    return (
      <div className="mx-1 mb-1.5 rounded-lg bg-stone-50 p-3">
        <p className="text-xs leading-relaxed text-stone-500">
          把生词本、复习进度和文章库同步到<strong className="text-stone-700">你自己的 Google Drive</strong>
          （隐藏的应用文件夹），在多台设备之间自动同步。
        </p>
        <button type="button" onClick={connect} className={`mt-2.5 bg-ink text-white hover:bg-stone-700 ${smallBtn}`}>
          连接 Google Drive
        </button>
        {sync.error && <p className="mt-2 text-xs text-rose-600">{sync.error}</p>}
      </div>
    )
  }
  return (
    <div className="mx-1 mb-1.5 rounded-lg bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-stone-600">Google Drive 同步</span>
        <span className={sync.status === 'expired' || sync.status === 'error' ? 'text-amber-600' : 'text-stone-400'}>
          {SYNC_LABEL[sync.status] ?? ''}
          {sync.status === 'ok' && sync.lastSyncAt && ` · ${new Date(sync.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </div>
      {sync.error && <p className="mt-1.5 text-xs text-rose-600">{sync.error}</p>}
      <div className="mt-2.5 flex gap-1.5">
        {sync.status === 'expired' ? (
          <button type="button" onClick={connect} className={`bg-ink text-white hover:bg-stone-700 ${smallBtn}`}>
            重新连接
          </button>
        ) : (
          <button
            type="button"
            onClick={syncNow}
            disabled={sync.status === 'syncing'}
            className={`bg-ink text-white hover:bg-stone-700 disabled:bg-stone-300 ${smallBtn}`}
          >
            立即同步
          </button>
        )}
        {sync.status !== 'expired' && (
          <button
            type="button"
            aria-expanded={showCloud}
            onClick={() => setShowCloud((v) => !v)}
            className={`text-stone-600 hover:bg-stone-200 ${showCloud ? 'bg-stone-200' : ''} ${smallBtn}`}
          >
            查看云端数据
          </button>
        )}
        <button
          type="button"
          onClick={() => window.confirm('断开 Google Drive？本机和 Drive 上已有的数据都会保留，只是不再自动同步。') && disconnect()}
          className={`text-stone-500 hover:bg-stone-200 ${smallBtn}`}
        >
          断开
        </button>
      </div>
      {/* key：每次同步完成后重新读取，保证显示的是最新数据 */}
      {showCloud && sync.status !== 'expired' && <CloudPanel key={sync.lastSyncAt} />}
    </div>
  )
}

function NavLink({ href, active, children }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm whitespace-nowrap outline-none max-[400px]:px-1.5 sm:px-2.5 transition-colors hover:bg-stone-100 hover:text-stone-800 focus-visible:ring-2 focus-visible:ring-stone-300 ${
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
  const sync = useSyncState()
  // 已连接 Drive 自动同步时，不再提醒手动备份
  const backup = sync.connected ? { needsBackup: false } : getBackupStatus(words, lastBackupAt)
  // 授权过期需要用户点「重新连接」：在 ⚙️ 上也显示提醒圆点
  const needsAttention = backup.needsBackup || sync.status === 'expired'
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
      const { added, updated, skipped, articles } = await importWords(file)
      setLastBackupAt(getLastBackupAt())
      const parts = [`新增 ${added} 个`, updated && `更新 ${updated} 个`, articles && `文章 ${articles} 篇`, skipped && `跳过 ${skipped} 个无效`]
      setMessage({ type: 'ok', text: `导入完成：${parts.filter(Boolean).join('，')}` })
    } catch (err) {
      setMessage({ type: 'error', text: `导入失败：${err.message}` })
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-stone-200/60 bg-paper/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 max-[400px]:px-3 sm:px-6">
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
          <NavLink href="#/" active={route === 'read' || route === 'library'}>
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
          <NavLink href="#/vocab" active={route === 'vocab'}>
            <span className="sm:hidden">词汇</span>
            <span className="hidden sm:inline">词汇库</span>
          </NavLink>
          <ModeMenu />
          <span className="mx-1 h-4 w-px bg-stone-200 max-[400px]:hidden sm:mx-1.5" />

        <div ref={menuRef} className="relative flex items-center">
          {/* 同步状态：一眼看出有没有连接 Drive，点击打开同一个菜单 */}
          <button
            type="button"
            aria-label={sync.connected ? `Google Drive 同步：${SYNC_LABEL[sync.status] ?? ''}` : '连接 Google Drive 同步'}
            title={sync.connected ? `Google Drive：${SYNC_LABEL[sync.status] ?? ''}` : '连接 Google Drive，在多台设备间同步'}
            onClick={() => {
              setOpen((v) => !v)
              setMessage(null)
            }}
            className={`rounded-md p-2 transition-colors hover:bg-stone-100 hover:text-stone-700 max-[400px]:p-1.5 ${
              sync.status === 'expired' || sync.status === 'error'
                ? 'text-amber-600'
                : sync.connected
                  ? 'text-emerald-600'
                  : 'text-stone-400'
            }`}
          >
            <CloudIcon status={sync.status} connected={sync.connected} />
          </button>
          <button
            type="button"
            aria-label={needsAttention ? '设置（需要处理）' : '设置'}
            aria-expanded={open}
            title={sync.status === 'expired' ? 'Google Drive 授权已过期' : backup.needsBackup ? `有 ${backup.unsavedCount} 个生词未备份` : '设置'}
            onClick={() => {
              setOpen((v) => !v)
              setMessage(null)
            }}
            className={`relative rounded-md p-2 transition-colors hover:bg-stone-100 hover:text-stone-700 max-[400px]:p-1.5 ${
              open ? 'bg-stone-100 text-stone-700' : 'text-stone-400'
            }`}
          >
            <GearIcon />
            {/* 备份 / 同步提醒小圆点 */}
            {needsAttention && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500 ring-2 ring-paper" />
            )}
          </button>

          {open && (
            <div
              role="menu"
              className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 origin-top-right animate-pop sm:w-64 rounded-xl border border-stone-200/80 bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
            >
              <div className="flex items-baseline justify-between px-2.5 pt-1.5 pb-2 text-[11px] text-stone-400">
                <a href="#/vocab" onClick={() => setOpen(false)} className="font-medium tracking-wide uppercase hover:text-stone-700">
                  生词本 · {words.length} 个 ›
                </a>
                <span>上次备份：{formatAgo(lastBackupAt)}</span>
              </div>

              <SyncSection sync={sync} />

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
