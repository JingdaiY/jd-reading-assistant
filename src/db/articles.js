import { contentStats, db, isActive, nowIso } from '.'
import { sampleArticle } from '../data/sampleArticle'
import { markDirty } from '../sync/events'

// 文章库：用户导入的文章 / 书籍。分三部分存（见 db/index.js 的 v3 说明）：
//
// articles（元数据，同步）：
// {
//   id, title, author, kind: 'paste' | 'txt' | 'epub' | 'pdf',
//   chapterCount, wordCount, contentSize,           // 书架显示用
//   hasOriginal, originalName, originalType, originalSize,  // 原始文件（PDF / EPUB）
//   progress: { chapter, page, ratio },
//   createdAt, updatedAt, deletedAt
// }
// contents（正文，本机缓存）：{ id, chapters: [{ title, paragraphs, pages? }], lastOpenedAt, uploaded: 0 | 1 }
//   paragraphs 里的元素：字符串（一段文字），或 { type: 'img', src, alt }（EPUB 插图，src 是 EPUB 包里的路径）
//   pages（仅 PDF）：每段文字在原 PDF 里的页码（从 0 开始），用于“查看原版页面”
// originals（原始文件，本机缓存）：{ id, blob, lastOpenedAt, uploaded: 0 | 1 }
//
// 内置示例文章不存数据库（id 为 'sample'），不参与同步。

export const SAMPLE_ID = 'sample'
export const CACHE_BOOKS = 3 // 本机最多缓存最近打开的 3 本书的正文和原始文件（已上传到 Drive 的才会被清理）

export const SAMPLE = {
  id: SAMPLE_ID,
  title: sampleArticle.title,
  author: null,
  kind: 'sample',
  meta: sampleArticle.meta,
  chapterCount: 1,
  wordCount: sampleArticle.paragraphs.join(' ').split(/\s+/).length,
  progress: { chapter: 0, ratio: 0 },
}
export const SAMPLE_CONTENT = { id: SAMPLE_ID, chapters: [{ title: null, paragraphs: sampleArticle.paragraphs }] }

const CURRENT_KEY = 'jdra.currentArticle' // 当前打开的文章，每台设备各自记，不同步

export function getCurrentArticleId() {
  return localStorage.getItem(CURRENT_KEY) || SAMPLE_ID
}

export function setCurrentArticleId(id) {
  localStorage.setItem(CURRENT_KEY, id)
}

/** 书架：所有有效文章的元数据（不含正文，不会把整本书读进内存），最近更新的在前 */
export async function getArticles() {
  const list = await db.articles.filter(isActive).toArray()
  return list.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

export async function getArticle(id) {
  if (id === SAMPLE_ID) return SAMPLE
  const a = await db.articles.get(id)
  return a && isActive(a) ? a : null
}

/** 哪些书的正文 / 原始文件在本机（书架显示“本机 / 云端”用） */
export async function getLocalCacheState() {
  const [contents, originals] = await Promise.all([db.contents.toCollection().primaryKeys(), db.originals.toCollection().primaryKeys()])
  return { contents: new Set(contents), originals: new Set(originals) }
}

/**
 * 新增一篇文章，返回它的 id。
 * original：原始文件（PDF / EPUB 的 File），保存下来用于查看原版页面和显示 EPUB 插图
 */
export async function addArticle({ title, author = null, kind, chapters, original = null }) {
  const t = nowIso()
  const id = crypto.randomUUID()
  await db.transaction('rw', db.articles, db.contents, db.originals, async () => {
    await db.articles.add({
      id,
      title: title?.trim() || '未命名',
      author,
      kind,
      ...contentStats(chapters),
      hasOriginal: !!original,
      originalName: original?.name ?? null,
      originalType: original?.type || null,
      originalSize: original?.size ?? null,
      progress: { chapter: 0, page: 0, ratio: 0 },
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    })
    await db.contents.put({ id, chapters, lastOpenedAt: t, uploaded: 0 })
    if (original) await db.originals.put({ id, blob: original, lastOpenedAt: t, uploaded: 0 })
  })
  markDirty()
  return id
}

/** 删除文章：元数据留下删除记录（同步到其他设备），本机的正文和原始文件直接删掉 */
export async function deleteArticle(id) {
  const t = nowIso()
  await db.transaction('rw', db.articles, db.contents, db.originals, async () => {
    await db.articles.update(id, { deletedAt: t, updatedAt: t })
    await db.contents.delete(id)
    await db.originals.delete(id)
  })
  if (getCurrentArticleId() === id) setCurrentArticleId(SAMPLE_ID)
  markDirty()
}

/** 保存阅读进度（内置示例文章不保存） */
export async function saveProgress(id, progress) {
  if (id === SAMPLE_ID) return
  await db.articles.update(id, { progress, updatedAt: nowIso() })
  markDirty()
}

// 「在这里结束本次阅读」横线：{ chapter, paragraph, offset }（第几章、本章第几段、那一行从段落第几个字开始），null = 没有。
// 存在文章元数据里，跟着书同步到其他设备；内置示例文章不进数据库，存在 localStorage
const SAMPLE_BOOKMARK_KEY = 'jdra.sampleBookmark'
export function getSampleBookmark() {
  try {
    return JSON.parse(localStorage.getItem(SAMPLE_BOOKMARK_KEY)) ?? null
  } catch {
    return null
  }
}
export async function saveBookmark(id, bookmark) {
  if (id === SAMPLE_ID) {
    if (bookmark) localStorage.setItem(SAMPLE_BOOKMARK_KEY, JSON.stringify(bookmark))
    else localStorage.removeItem(SAMPLE_BOOKMARK_KEY)
    return
  }
  await db.articles.update(id, { bookmark: bookmark ?? null, updatedAt: nowIso() })
  markDirty()
}

// ---------------- 本机缓存：正文 / 原始文件 ----------------

/** 读本机缓存的正文（没有返回 null），并记录“最近打开” */
export async function getLocalContent(id) {
  if (id === SAMPLE_ID) return SAMPLE_CONTENT
  const c = await db.contents.get(id)
  if (c) await db.contents.update(id, { lastOpenedAt: nowIso() })
  return c ?? null
}

export async function putLocalContent(id, chapters, { uploaded }) {
  await db.contents.put({ id, chapters, lastOpenedAt: nowIso(), uploaded: uploaded ? 1 : 0 })
}

/** 读本机缓存的原始文件 Blob（没有返回 null） */
export async function getLocalOriginal(id) {
  const o = await db.originals.get(id)
  if (o) await db.originals.update(id, { lastOpenedAt: nowIso() })
  return o?.blob ?? null
}

export async function putLocalOriginal(id, blob, { uploaded }) {
  await db.originals.put({ id, blob, lastOpenedAt: nowIso(), uploaded: uploaded ? 1 : 0 })
}

/** 标记已上传到 Drive（之后才允许被缓存清理） */
export async function markUploaded(table, id) {
  await (table === 'original' ? db.originals : db.contents).update(id, { uploaded: 1 })
}

/**
 * 清理本机缓存：只保留最近打开的 CACHE_BOOKS 本书的正文和原始文件。
 * 只清理已经上传到 Drive 的（uploaded = true）——没上传的是唯一一份，绝不能删。
 * keepId：当前正在读的书，无论如何都保留。
 */
export async function evictCache(keepId) {
  for (const table of [db.contents, db.originals]) {
    // 只读主键和索引，不读正文 / 文件内容
    const recent = await table.orderBy('lastOpenedAt').reverse().primaryKeys()
    const uploaded = new Set(await table.where('uploaded').equals(1).primaryKeys())
    const keep = new Set(recent.slice(0, CACHE_BOOKS))
    if (keepId) keep.add(keepId)
    const removable = recent.filter((id) => !keep.has(id) && uploaded.has(id))
    if (removable.length) await table.bulkDelete(removable)
  }
}
