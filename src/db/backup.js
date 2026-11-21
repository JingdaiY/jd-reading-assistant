import { createWordRecord, db } from '.'
import { getLastBackupAt, setLastBackupAt } from './backupReminder'

const APP_ID = 'jd-reading-assistant'
const BACKUP_VERSION = 1

/** 把整个生词本导出为 JSON 文件并触发浏览器下载 */
export async function exportWords() {
  const words = await db.words.orderBy('createdAt').toArray()
  const backup = {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    count: words.length,
    words,
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `jd-reading-words-${new Date().toLocaleDateString('sv')}.json` // 'sv' 区域格式 = 本地日期 YYYY-MM-DD
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000) // 等下载开始后再释放
  setLastBackupAt(backup.exportedAt)
  return words.length
}

/**
 * 从 JSON 备份文件导入生词，合并进现有生词本。
 * - 同一个词（忽略大小写）已存在时跳过，保留本地记录（本地的复习进度更可信）
 * - 缺失的字段用默认值补齐，避免旧版本 / 手改过的文件导致数据残缺
 * - 文件的导出时间比本地记录的“上次备份”更新时，更新它：这些词本来就在备份文件里，
 *   否则在新浏览器里恢复备份后会立刻被提醒“该备份了”
 * 返回 { added, skipped }
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

  return db.transaction('rw', db.words, async () => {
    const existing = await db.words.toArray()
    const seenWords = new Set(existing.map((w) => w.word.toLowerCase()))
    const seenIds = new Set(existing.map((w) => w.id))

    const toAdd = []
    let skipped = 0
    for (const item of items) {
      const word = typeof item?.word === 'string' ? item.word.trim() : ''
      if (!word || seenWords.has(word.toLowerCase())) {
        skipped++
        continue
      }
      const record = { ...createWordRecord({ word }), ...item, word }
      if (!record.id || seenIds.has(record.id)) record.id = crypto.randomUUID()
      seenWords.add(word.toLowerCase())
      seenIds.add(record.id)
      toAdd.push(record)
    }

    await db.words.bulkAdd(toAdd)

    const exportedAt = !Array.isArray(data) && Date.parse(data.exportedAt) ? data.exportedAt : null
    const last = getLastBackupAt()
    if (exportedAt && (!last || Date.parse(exportedAt) > Date.parse(last))) setLastBackupAt(exportedAt)

    return { added: toAdd.length, skipped }
  })
}
