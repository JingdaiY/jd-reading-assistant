import Dexie from 'dexie'
import { newCardFields } from '../srs'
import { markDirty } from '../sync/events'

// 本地数据库：承担“后端数据库”的角色，数据存在浏览器 IndexedDB 里
export const db = new Dexie('jd-reading-assistant')

// 只需声明主键和要查询的索引字段，其余字段（translation、context 等）照样会存
// id: 主键 (uuid)；word: 按词查找；due/state: 复习室按到期时间、状态筛选
db.version(1).stores({
  words: 'id, word, due, state, createdAt',
})

// v2：为多设备同步做准备
// - 每条记录加 updatedAt（最后修改时间），同步时按它决定谁覆盖谁
// - 删除改为“软删除”：留一条带 deletedAt 的删除记录，同步时另一台设备才知道它被删了
// - 新增 articles 表：用户导入的文章 / 书籍
db.version(2)
  .stores({
    words: 'id, word, due, state, createdAt, updatedAt',
    articles: 'id, updatedAt',
  })
  .upgrade((tx) =>
    tx
      .table('words')
      .toCollection()
      .modify((w) => {
        w.updatedAt ??= w.lastReview || w.createdAt
        w.deletedAt ??= null
      }),
  )

// FSRS 卡片状态（与 ts-fsrs 的 State 枚举一致）
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 }

export const nowIso = () => new Date().toISOString()
export const isActive = (r) => !r.deletedAt

/** 按设计文档的数据结构创建一条生词记录 */
export function createWordRecord({ word, translation, context, phonetic, pos, etymology, source }) {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    word,
    translation,
    context,
    phonetic: phonetic ?? null,
    pos: pos ?? null,
    etymology: etymology ?? null,
    source,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,

    // ts-fsrs 调度参数：新卡片立即到期（state=New），之后每次复习由 FSRS 更新。
    // 包含设计文档的 due/state/repetition/stability/difficulty，
    // 以及 FSRS 准确调度还需要的 lapses/lastReview/learningSteps/scheduledDays/elapsedDays
    ...newCardFields(now),
  }
}

/** 生词本里所有有效（未删除）的词 */
export function getActiveWords() {
  return db.words.filter(isActive).toArray()
}

/** 有效词里已到期（due <= now）的数量 */
export function countDueWords(now = new Date()) {
  return db.words.where('due').belowOrEqual(now.toISOString()).filter(isActive).count()
}

/** 取出所有已到期（due <= now）的有效词，最早到期的排前面 */
export async function getDueWords(now = new Date()) {
  const list = await db.words.where('due').belowOrEqual(now.toISOString()).sortBy('due')
  return list.filter(isActive)
}

/** 写回一次复习后的调度字段 */
export async function saveReview(id, fields) {
  await db.words.update(id, { ...fields, updatedAt: nowIso() })
  markDirty()
}

/** 查找同一个词（忽略大小写），包括已删除的记录 */
function findAnyWord(word) {
  return db.words.where('word').equalsIgnoreCase(word).first()
}

/**
 * 已标记则取消（留下删除记录），否则标记；返回操作后是否处于已标记状态。
 * 之前删过的词再次标记时，复用原来那条记录（同一个 id），复习进度从头开始。
 */
export async function toggleWord(entry) {
  const marked = await db.transaction('rw', db.words, async () => {
    const existing = await findAnyWord(entry.word)
    if (existing && isActive(existing)) {
      const t = nowIso()
      await db.words.update(existing.id, { deletedAt: t, updatedAt: t })
      return false
    }
    const record = createWordRecord(entry)
    await db.words.put(existing ? { ...record, id: existing.id, createdAt: existing.createdAt } : record)
    return true
  })
  markDirty()
  return marked
}

/** 删除一个生词（软删除：留下删除记录，同步到其他设备） */
export async function deleteWord(id) {
  const t = nowIso()
  await db.words.update(id, { deletedAt: t, updatedAt: t })
  markDirty()
}

/** 更新生词的释义相关字段（重新查询释义时用），不影响复习进度 */
export async function updateWordInfo(id, { translation, phonetic, pos, etymology }) {
  await db.words.update(id, {
    translation: translation ?? null,
    phonetic: phonetic ?? null,
    pos: pos ?? null,
    etymology: etymology ?? null,
    updatedAt: nowIso(),
  })
  markDirty()
}

/** 释义需要补全：没有释义，或者还是早期的演示数据（Mock Translation） */
export const needsDefinition = (w) => !w.translation?.trim() || /mock translation/i.test(w.translation)
