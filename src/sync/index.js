import { useSyncExternalStore } from 'react'
import { db } from '../db'
import { onDirty } from './events'
import { AuthError, downloadSyncFile, findSyncFile, getToken, requestToken, revokeToken, uploadSyncFile } from './google'
import { articleKey, mergeRecords, wordKey } from './merge'

// 同步流程：下载 Drive 上的数据 → 和本地逐条合并 → 远端较新的写入本地 → 本地有更新时上传。
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

async function runSync() {
  setState({ status: 'syncing', error: null })
  const fileId = await findSyncFile()
  const remote = fileId ? await downloadSyncFile(fileId) : {}

  const localWords = await db.words.toArray()
  const localArticles = await db.articles.toArray()
  const w = mergeRecords(localWords, Array.isArray(remote.words) ? remote.words : [], wordKey)
  const a = mergeRecords(localArticles, Array.isArray(remote.articles) ? remote.articles : [], articleKey)

  // 远端较新的记录写入本地（直接写表，不触发 markDirty，避免同步完又触发一次同步）
  if (w.localWrites.length || a.localWrites.length) {
    await db.transaction('rw', db.words, db.articles, async () => {
      await db.words.bulkPut(w.localWrites)
      await db.articles.bulkPut(a.localWrites)
    })
  }

  if (!fileId || w.remoteChanged || a.remoteChanged) {
    await uploadSyncFile(fileId, { app: 'jd-reading-assistant', version: 1, updatedAt: new Date().toISOString(), words: w.merged, articles: a.merged })
  }
  setState({ status: 'ok', lastSyncAt: new Date().toISOString() })
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
