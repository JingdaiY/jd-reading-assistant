import { createWordRecord, db, isActive } from '.'
import { markDirty } from '../sync/events'
import { articleKey, mergeRecords, wordKey } from '../sync/merge'
import { downloadJson, todayStamp } from '../utils/download'
import { getLastBackupAt, setLastBackupAt } from './backupReminder'

const APP_ID = 'jd-reading-assistant'
// v1：只有 words；v2：words + articles
const BACKUP_VERSION = 2

/** 把生词本和文章库导出为 JSON 文件并触发浏览器下载 */
export async function exportWords() {
  const words = (await db.words.orderBy('createdAt').toArray()).filter(isActive)
  const articles = (await db.articles.toArray()).filter(isActive)
  const backup = {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    count: words.length,
    words,
    articles,
  }

  downloadJson(backup, `jd-reading-words-${todayStamp()}.json`)
  setLastBackupAt(backup.exportedAt)
  return words.length
}

/** 补齐缺失字段：兼容旧版本 / 手改过的备份文件 */
function normalizeWord(item) {
  const word = typeof item?.word === 'string' ? item.word.trim() : ''
  if (!word) return null
  const base = createWordRecord({ word })
  return { ...base, ...item, word, updatedAt: item.updatedAt ?? item.lastReview ?? item.createdAt ?? base.updatedAt }
}

function normalizeArticle(item) {
  if (!item?.id || !Array.isArray(item.chapters)) return null
  return { progress: { chapter: 0, ratio: 0 }, deletedAt: null, ...item, updatedAt: item.updatedAt ?? item.createdAt }
}

/**
 * 从 JSON 备份文件导入，逐条合并进现有数据（和 Google Drive 同步用同一套规则）：
 * 同一个词两边都有时，最后修改时间更新的那份胜出（所以复习进度也会合并）。
 * 返回 { added, updated, skipped, articles }
 */
export async function importWords(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  // 兼容两种格式：完整备份对象 { app, words: [...] }，或直接是一个数组
  const items = Array.isArray(data) ? data : data?.words
  if (!Array.isArray(items)) throw new Error('文件里没有找到生词列表')

  const incomingWords = items.map(normalizeWord).filter(Boolean)
  const skipped = items.length - incomingWords.length
  const incomingArticles = (Array.isArray(data?.articles) ? data.articles : []).map(normalizeArticle).filter(Boolean)

  const result = await db.transaction('rw', db.words, db.articles, async () => {
    const localWords = await db.words.toArray()
    const localKeys = new Set(localWords.map(wordKey))
    const w = mergeRecords(localWords, incomingWords, wordKey)
    await db.words.bulkPut(w.localWrites)

    const a = mergeRecords(await db.articles.toArray(), incomingArticles, articleKey)
    await db.articles.bulkPut(a.localWrites)

    const added = w.localWrites.filter((r) => !localKeys.has(wordKey(r))).length
    return { added, updated: w.localWrites.length - added, skipped, articles: a.localWrites.length }
  })

  const exportedAt = !Array.isArray(data) && Date.parse(data.exportedAt) ? data.exportedAt : null
  const last = getLastBackupAt()
  if (exportedAt && (!last || Date.parse(exportedAt) > Date.parse(last))) setLastBackupAt(exportedAt)

  markDirty()
  return result
}
