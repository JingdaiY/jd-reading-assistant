// 备份提醒：记录上次导出时间（localStorage），据此判断是否该提醒用户备份

const STORAGE_KEY = 'jdra.lastBackupAt'
const DAY = 24 * 60 * 60 * 1000

export const REMIND_AFTER_DAYS = 7 // 有未备份的词，且距上次备份超过 7 天
export const REMIND_AFTER_WORDS = 20 // 或者未备份的词达到 20 个

export function getLastBackupAt() {
  return localStorage.getItem(STORAGE_KEY)
}

export function setLastBackupAt(iso) {
  localStorage.setItem(STORAGE_KEY, iso)
}

/**
 * 计算备份状态。
 * “未备份的词” = 上次备份之后新建的词（从未备份过则是全部词）。
 * 从未备份过时，从最早那个词的创建时间开始算天数，避免刚开始用就被提醒。
 */
export function getBackupStatus(words, lastBackupAt, now = Date.now()) {
  const last = lastBackupAt ? new Date(lastBackupAt).getTime() : null
  const unsaved = words.filter((w) => last === null || new Date(w.createdAt).getTime() > last)

  if (unsaved.length === 0) return { needsBackup: false, unsavedCount: 0, lastBackupAt }

  const since = last ?? Math.min(...unsaved.map((w) => new Date(w.createdAt).getTime()))
  const days = (now - since) / DAY
  return {
    needsBackup: unsaved.length >= REMIND_AFTER_WORDS || days >= REMIND_AFTER_DAYS,
    unsavedCount: unsaved.length,
    lastBackupAt,
  }
}

/** “3 天前” / “今天” 这样的相对时间 */
export function formatAgo(iso, now = Date.now()) {
  if (!iso) return '从未备份'
  const days = Math.floor((now - new Date(iso).getTime()) / DAY)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  return `${days} 天前`
}
