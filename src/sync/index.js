import { useSyncExternalStore } from 'react'
import { contentStats, db, isActive } from '../db'
import { evictCache, getCurrentArticleId, getLocalContent, getLocalOriginal, markUploaded, putLocalContent, putLocalOriginal } from '../db/articles'
import { downloadJson, todayStamp } from '../utils/download'
import { onDirty } from './events'
import {
  AuthError,
  contentFileName,
  deleteFile,
  downloadFile,
  getToken,
  INDEX_FILE,
  listAppFiles,
  originalFileName,
  requestToken,
  revokeToken,
  uploadFile,
} from './google'
import { articleKey, mergeRecords, wordKey } from './merge'

// 同步流程：
//   1. 下载索引文件（生词 + 书架目录）→ 和本地逐条合并 → 远端较新的写入本地 → 本地有更新时上传索引
//   2. 本机新导入的书：把正文和原始文件各自上传成单独的文件（只上传一次，之后内容不变）
//   3. 已删除的书：删掉 Drive 上它的正文和原始文件，释放用户的 Drive 空间
//   4. 清理本机缓存：只留最近打开的 3 本书（已上传的才会被清理）
// 书的正文和原始文件不会在同步时下载——打开这本书时才下载（见 ensureContent / ensureOriginal）。
// 同步什么：生词（含复习进度、删除记录）和文章库。不同步：API Key、查词模式等设置（每台设备单独设置）。

const STATE_KEY = 'jdra.sync' // { connected, lastSyncAt }
const DIRTY_DELAY_MS = 3000 // 本地数据变化后 3 秒同步（连续操作只同步一次）
const FOCUS_MIN_INTERVAL_MS = 30_000 // 切回页面时，距上次同步超过 30 秒才再同步

// ---------------- 状态（给界面显示用） ----------------

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}')
  } catch {
    return {}
  }
})()

// status: 'idle' 未连接 | 'syncing' 同步中 | 'ok' 已同步 | 'expired' 授权过期 | 'error' 出错
let state = {
  connected: !!saved.connected,
  lastSyncAt: saved.lastSyncAt ?? null,
  status: saved.connected ? (getToken() ? 'ok' : 'expired') : 'idle',
  error: null,
}
const listeners = new Set()

function setState(patch) {
  state = { ...state, ...patch }
  localStorage.setItem(STATE_KEY, JSON.stringify({ connected: state.connected, lastSyncAt: state.lastSyncAt }))
  listeners.forEach((fn) => fn())
}

export function useSyncState() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )
}

// ---------------- 同步 ----------------

let running = null // 正在进行的同步（避免并发）
let again = false // 同步过程中本地又有改动：结束后再同步一次

/** 旧版（v1）索引文件把整本书的正文放在 articles[].chapters 里：拆成元数据 + 正文 */
function splitLegacyArticles(remoteArticles) {
  const metas = []
  const contents = new Map()
  for (const a of remoteArticles) {
    if (!Array.isArray(a.chapters)) {
      metas.push(a)
      continue
    }
    const { chapters, ...meta } = a
    if (!a.deletedAt && chapters.length) contents.set(a.id, chapters)
    metas.push({ hasOriginal: false, ...contentStats(chapters), ...meta })
  }
  return { metas, contents }
}

async function runSync() {
  setState({ status: 'syncing', error: null })
  const files = await listAppFiles()
  const indexFile = files.get(INDEX_FILE)
  const remote = indexFile ? await downloadFile(indexFile.id) : {}
  const { metas: remoteArticles, contents: legacyContents } = splitLegacyArticles(Array.isArray(remote.articles) ? remote.articles : [])

  // 1. 生词 + 书架目录（都很小）逐条合并
  const localWords = await db.words.toArray()
  const localArticles = await db.articles.toArray() // v3 起只有元数据，不含正文
  const w = mergeRecords(localWords, Array.isArray(remote.words) ? remote.words : [], wordKey)
  const a = mergeRecords(localArticles, remoteArticles, articleKey)

  // 远端较新的记录写入本地（直接写表，不触发 markDirty，避免同步完又触发一次同步）
  if (w.localWrites.length || a.localWrites.length) {
    await db.transaction('rw', db.words, db.articles, async () => {
      await db.words.bulkPut(w.localWrites)
      await db.articles.bulkPut(a.localWrites)
    })
  }
  // 旧版索引里带的正文：本机没有就存下来（标记未上传，下面会作为单独文件上传）
  for (const [id, chapters] of legacyContents) {
    if (!(await db.contents.where('id').equals(id).count())) await putLocalContent(id, chapters, { uploaded: false })
  }

  const active = new Map(a.merged.filter(isActive).map((x) => [x.id, x]))

  // 2. 上传本机有、Drive 上还没有的正文 / 原始文件（一次只读一本，避免把整个书架读进内存）
  for (const id of await db.contents.toCollection().primaryKeys()) {
    if (!active.has(id)) continue
    if (!files.has(contentFileName(id))) {
      const c = await db.contents.get(id)
      await uploadFile({ name: contentFileName(id), data: JSON.stringify({ id, chapters: c.chapters }) })
    }
    await markUploaded('content', id)
  }
  for (const id of await db.originals.toCollection().primaryKeys()) {
    if (!active.has(id)) continue
    if (!files.has(originalFileName(id))) {
      const o = await db.originals.get(id)
      await uploadFile({ name: originalFileName(id), data: o.blob, mimeType: active.get(id).originalType || 'application/octet-stream' })
    }
    await markUploaded('original', id)
  }

  // 3. 已删除的书：删掉 Drive 上它的正文和原始文件
  for (const art of a.merged) {
    if (isActive(art)) continue
    for (const name of [contentFileName(art.id), originalFileName(art.id)]) {
      const f = files.get(name)
      if (f) await deleteFile(f.id)
    }
  }

  // 索引：有变化、还没有索引、或者还是旧版格式时上传
  if (!indexFile || w.remoteChanged || a.remoteChanged || legacyContents.size || remote.version !== 2) {
    await uploadFile({
      name: INDEX_FILE,
      fileId: indexFile?.id ?? null,
      data: JSON.stringify({ app: 'jd-reading-assistant', version: 2, updatedAt: new Date().toISOString(), words: w.merged, articles: a.merged }),
    })
  }

  // 4. 清理本机缓存
  await evictCache(getCurrentArticleId())
  setState({ status: 'ok', lastSyncAt: new Date().toISOString() })
}

// ---------------- 打开书时按需下载 ----------------

function notAvailable(what) {
  if (!state.connected) return new Error(`这本书的${what}不在本机。连接 Google Drive（右上角云朵图标）后可以从云端下载。`)
  if (!getToken()) return new Error(`这本书的${what}不在本机，需要从 Google Drive 下载，但授权已过期：请点右上角云朵图标「重新连接」后再试。`)
  return null
}

/** 取得一本书的正文：本机有就直接用；没有就从 Drive 下载并缓存到本机 */
export async function ensureContent(id) {
  const local = await getLocalContent(id)
  if (local) return local.chapters
  const blocked = notAvailable('正文')
  if (blocked) throw blocked
  const file = (await listAppFiles()).get(contentFileName(id))
  if (!file) throw new Error('云端也没有这本书的正文：可能导入它的设备还没完成同步，稍后再试。')
  const { chapters } = await downloadFile(file.id)
  await putLocalContent(id, chapters, { uploaded: true })
  await evictCache(id)
  return chapters
}

/** 取得一本书的原始文件（PDF / EPUB）：本机有就直接用；没有就从 Drive 下载并缓存到本机 */
export async function ensureOriginal(id) {
  const local = await getLocalOriginal(id)
  if (local) return local
  const blocked = notAvailable('原始文件')
  if (blocked) throw blocked
  const file = (await listAppFiles()).get(originalFileName(id))
  if (!file) throw new Error('云端也没有这本书的原始文件：可能导入它的设备还没完成同步，稍后再试。')
  const blob = await downloadFile(file.id, 'blob')
  await putLocalOriginal(id, blob, { uploaded: true })
  await evictCache(id)
  return blob
}

/** 立即同步一次。没连接或授权过期时什么都不做（授权过期需要用户点「重新连接」） */
export async function syncNow() {
  if (!state.connected) return
  if (!getToken()) return setState({ status: 'expired' })
  if (running) {
    again = true
    return running
  }
  running = runSync()
    .catch((err) => {
      if (err instanceof AuthError) setState({ status: 'expired', error: null })
      else setState({ status: 'error', error: err.message })
    })
    .finally(() => {
      running = null
      if (again) {
        again = false
        syncNow()
      }
    })
  return running
}

/** 连接 Google Drive（第一次）或重新连接（授权过期后）。必须由按钮点击触发 */
export async function connect() {
  try {
    await requestToken({ firstTime: !state.connected })
    setState({ connected: true, status: 'ok', error: null })
    await syncNow()
  } catch (err) {
    setState({ status: state.connected ? 'expired' : 'idle', error: err.message })
  }
}

/** 断开：撤销授权，本地和 Drive 上的数据都保留 */
export async function disconnect() {
  await revokeToken()
  setState({ connected: false, status: 'idle', error: null, lastSyncAt: null })
}

// ---------------- 自动同步 ----------------

let started = false
/** 应用启动时调用一次：打开时同步、本地数据变化后同步、切回页面时同步 */
export function startAutoSync() {
  if (started) return
  started = true
  let timer
  onDirty(() => {
    clearTimeout(timer)
    timer = setTimeout(syncNow, DIRTY_DELAY_MS)
  })
  document.addEventListener('visibilitychange', () => {
    const last = Date.parse(state.lastSyncAt ?? 0) || 0
    if (document.visibilityState === 'visible' && Date.now() - last > FOCUS_MIN_INTERVAL_MS) syncNow()
  })
  syncNow()
}

// ---------------- 查看云端数据 ----------------

/**
 * 读取 Drive 上的同步数据，和本机对比。书的正文 / 原始文件只统计数量和大小，不下载。
 * 返回 { cloud: { words, deletedWords, articles, updatedAt, bytes, bookFiles, bookBytes } | null, local: { words, articles }, raw }
 */
export async function getCloudSummary() {
  if (!getToken()) {
    setState({ status: 'expired' })
    throw new AuthError('授权已过期，请先重新连接')
  }
  try {
    const files = await listAppFiles()
    const indexFile = files.get(INDEX_FILE)
    const raw = indexFile ? await downloadFile(indexFile.id) : null
    const words = raw?.words ?? []
    const articles = raw?.articles ?? []
    const bookFiles = [...files].filter(([name]) => name !== INDEX_FILE)
    return {
      cloud: raw && {
        words: words.filter(isActive).length,
        deletedWords: words.filter((w) => !isActive(w)).length,
        articles: articles.filter(isActive).length,
        updatedAt: raw.updatedAt ?? null,
        bytes: indexFile.size || new Blob([JSON.stringify(raw)]).size,
        bookFiles: bookFiles.length,
        bookBytes: bookFiles.reduce((n, [, f]) => n + f.size, 0),
      },
      local: { words: await db.words.filter(isActive).count(), articles: await db.articles.filter(isActive).count() },
      raw,
    }
  } catch (err) {
    if (err instanceof AuthError) setState({ status: 'expired' })
    throw err
  }
}

/** 把云端的原始同步文件下载到本机 */
export function downloadCloudFile(raw) {
  downloadJson(raw, `jd-reading-cloud-${todayStamp()}.json`)
}
