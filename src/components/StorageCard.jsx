import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db, isActive } from '../db'
import { CACHE_BOOKS, getArticles, getLocalCacheState } from '../db/articles'
import { getCloudUsage, useSyncState } from '../sync'

export const formatBytes = (n) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`

const CLOUD_CACHE_KEY = 'jdra.cloudUsage' // 上次读到的云端占用，收起时显示（读云端要联网，只在展开时才读）

/** 本机占用：按书的元数据里记的大小相加（不把正文 / 文件读进内存）；生词本按导出成 JSON 的大小估算 */
async function getLocalUsage() {
  const [articles, cache, words] = await Promise.all([getArticles(), getLocalCacheState(), db.words.toArray()])
  let contentBytes = 0
  let originalBytes = 0
  for (const a of articles) {
    if (cache.contents.has(a.id)) contentBytes += a.contentSize ?? 0
    if (cache.originals.has(a.id)) originalBytes += a.originalSize ?? 0
  }
  const wordsBytes = new Blob([JSON.stringify(words)]).size + new Blob([JSON.stringify(articles)]).size
  return {
    books: cache.contents.size,
    originals: cache.originals.size,
    words: words.filter(isActive).length,
    contentBytes,
    originalBytes,
    wordsBytes,
    total: contentBytes + originalBytes + wordsBytes,
  }
}

function Row({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-stone-500">{label}</span>
      <span className="text-right text-stone-700 tabular-nums">
        {value}
        {sub && <span className="ml-1.5 text-stone-400">{sub}</span>}
      </span>
    </div>
  )
}

function Bar({ used, limit }) {
  const pct = Math.min(100, (used / limit) * 100)
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200/80">
      <div className={`h-full rounded-full ${pct > 90 ? 'bg-rose-400' : pct > 70 ? 'bg-amber-400' : 'bg-stone-500'}`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
    </div>
  )
}

/**
 * 书架顶部的「💾 存储空间」：本机（浏览器存储）和 Google Drive 各占了多少。
 * 收起时一行总量；展开时分项，并读取云端（需要联网，所以只在展开时读）
 */
export default function StorageCard() {
  const [open, setOpen] = useState(false)
  const local = useLiveQuery(getLocalUsage, [], null)
  const sync = useSyncState()
  const [estimate, setEstimate] = useState(null) // 浏览器给出的整体用量 / 上限
  const [cloud, setCloud] = useState(() => {
    try {
      return { status: 'cached', ...JSON.parse(localStorage.getItem(CLOUD_CACHE_KEY)) }
    } catch {
      return { status: 'none' }
    }
  })
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!open) return
    navigator.storage?.estimate?.().then((e) => setEstimate(e)).catch(() => {})
  }, [open, local])

  useEffect(() => {
    if (!open || !sync.connected || sync.status === 'expired') return
    let alive = true
    setCloud((c) => ({ ...c, status: 'loading' }))
    getCloudUsage()
      .then((r) => {
        if (!alive) return
        const keep = { total: r.total, indexBytes: r.indexBytes, bookFiles: r.bookFiles, bookBytes: r.bookBytes, quota: r.quota, at: Date.now() }
        localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(keep))
        setCloud({ status: 'done', ...keep })
      })
      .catch((err) => alive && setCloud((c) => ({ ...c, status: 'error', error: err.message })))
    return () => {
      alive = false
    }
  }, [open, sync.connected, sync.status, sync.lastSyncAt, refresh])

  const hasCloud = sync.connected && cloud.total != null
  const summary = [local && `本机 ${formatBytes(local.total)}`, sync.connected ? (hasCloud ? `云端 ${formatBytes(cloud.total)}` : '云端 展开查看') : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="mt-6 rounded-xl border border-stone-200/80 bg-white/70 text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-stone-50"
      >
        <span className="font-medium text-stone-700">💾 存储空间</span>
        <span className="flex items-center gap-2 text-xs text-stone-500">
          {summary}
          <span aria-hidden className={`text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`}>
            ›
          </span>
        </span>
      </button>

      {open && local && (
        <div className="grid gap-4 border-t border-stone-200/70 px-4 py-3 text-xs sm:grid-cols-2 sm:gap-6">
          {/* ===== 本机 ===== */}
          <div>
            <p className="mb-1 font-medium text-stone-700">本机（这个浏览器）</p>
            <Row label="书的正文" value={formatBytes(local.contentBytes)} sub={`${local.books} 本`} />
            <Row label="原始文件（PDF / EPUB）" value={formatBytes(local.originalBytes)} sub={`${local.originals} 个`} />
            <Row label="生词本和书架信息" value={formatBytes(local.wordsBytes)} sub={`${local.words} 个词`} />
            <div className="mt-1 border-t border-stone-100 pt-1">
              <Row label="合计" value={formatBytes(local.total)} />
            </div>
            {estimate?.quota > 0 && (
              <>
                <p className="mt-2 text-stone-400">
                  浏览器统计：本网站已用 {formatBytes(estimate.usage ?? 0)}，上限约 {formatBytes(estimate.quota)}
                </p>
                <Bar used={estimate.usage ?? 0} limit={estimate.quota} />
              </>
            )}
            <p className="mt-2 leading-relaxed text-stone-400">
              本机最多缓存 {CACHE_BOOKS} 本书；超出时，已上传到云端的旧书会自动清掉本机副本，下次打开再下载。
            </p>
          </div>

          {/* ===== Google Drive ===== */}
          <div>
            <p className="mb-1 font-medium text-stone-700">Google Drive</p>
            {!sync.connected ? (
              <p className="leading-relaxed text-stone-400">未连接。在右上角 ⚙️ 菜单里连接 Google Drive 后，这里会显示云端占用。</p>
            ) : sync.status === 'expired' ? (
              <p className="leading-relaxed text-amber-600">授权已过期：在 ⚙️ 菜单里点「重新连接」后再查看。</p>
            ) : (
              <>
                {cloud.total != null && (
                  <>
                    <Row label="生词本和书架信息" value={formatBytes(cloud.indexBytes)} />
                    <Row label="书的正文和原始文件" value={formatBytes(cloud.bookBytes)} sub={`${cloud.bookFiles} 个文件`} />
                    <div className="mt-1 border-t border-stone-100 pt-1">
                      <Row label="本应用合计" value={formatBytes(cloud.total)} />
                    </div>
                    {cloud.quota ? (
                      <>
                        <p className="mt-2 text-stone-400">
                          你的整个 Drive：已用 {formatBytes(cloud.quota.usage)}
                          {cloud.quota.limit ? ` / 共 ${formatBytes(cloud.quota.limit)}` : '（不限量）'}
                        </p>
                        {cloud.quota.limit && <Bar used={cloud.quota.usage} limit={cloud.quota.limit} />}
                      </>
                    ) : (
                      <p className="mt-2 text-stone-400">整个 Drive 的用量：当前授权读取不到</p>
                    )}
                  </>
                )}
                <p className={`mt-2 ${cloud.status === 'error' ? 'text-rose-600' : 'text-stone-400'}`}>
                  {cloud.status === 'loading'
                    ? '正在读取云端…'
                    : cloud.status === 'error'
                      ? `读取失败：${cloud.error}`
                      : cloud.at && `更新于 ${new Date(cloud.at).toLocaleString()}`}
                  {cloud.status !== 'loading' && (
                    <button type="button" onClick={() => setRefresh((n) => n + 1)} className="ml-2 text-stone-500 underline hover:text-stone-800">
                      刷新
                    </button>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
