import { db, isActive, nowIso } from '.'
import { sampleArticle } from '../data/sampleArticle'
import { markDirty } from '../sync/events'

// 文章库：用户导入的文章 / 书籍。
// 记录结构：
// {
//   id, title, author, kind: 'paste' | 'txt' | 'epub',
//   chapters: [{ title, paragraphs: [string] }],
//   progress: { chapter, ratio },   // 读到第几章、章内滚动到的位置（0~1）
//   createdAt, updatedAt, deletedAt
// }
// 内置示例文章不存数据库（id 为 'sample'），不参与同步。

export const SAMPLE_ID = 'sample'

export const SAMPLE = {
  id: SAMPLE_ID,
  title: sampleArticle.title,
  author: null,
  kind: 'sample',
  meta: sampleArticle.meta,
  chapters: [{ title: null, paragraphs: sampleArticle.paragraphs }],
  progress: { chapter: 0, ratio: 0 },
}

const CURRENT_KEY = 'jdra.currentArticle' // 当前打开的文章，每台设备各自记，不同步

export function getCurrentArticleId() {
  return localStorage.getItem(CURRENT_KEY) || SAMPLE_ID
}

export function setCurrentArticleId(id) {
  localStorage.setItem(CURRENT_KEY, id)
}

/** 书架：所有有效文章，最近更新的在前（不含内置示例） */
export async function getArticles() {
  const list = await db.articles.filter(isActive).toArray()
  return list.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

export async function getArticle(id) {
  if (id === SAMPLE_ID) return SAMPLE
  const a = await db.articles.get(id)
  return a && isActive(a) ? a : null
}

/** 新增一篇文章，返回它的 id */
export async function addArticle({ title, author = null, kind, chapters }) {
  const t = nowIso()
  const id = crypto.randomUUID()
  await db.articles.add({
    id,
    title: title?.trim() || '未命名',
    author,
    kind,
    chapters,
    progress: { chapter: 0, ratio: 0 },
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
  })
  markDirty()
  return id
}

/** 删除文章：留下删除记录（清空正文，节省同步空间） */
export async function deleteArticle(id) {
  const t = nowIso()
  await db.articles.update(id, { deletedAt: t, updatedAt: t, chapters: [] })
  if (getCurrentArticleId() === id) setCurrentArticleId(SAMPLE_ID)
  markDirty()
}

/** 保存阅读进度（内置示例文章不保存） */
export async function saveProgress(id, progress) {
  if (id === SAMPLE_ID) return
  await db.articles.update(id, { progress, updatedAt: nowIso() })
  markDirty()
}
