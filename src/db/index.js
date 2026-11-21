import Dexie from 'dexie'
import { newCardFields } from '../srs'

// 本地数据库：承担“后端数据库”的角色，数据存在浏览器 IndexedDB 里
export const db = new Dexie('jd-reading-assistant')

// 只需声明主键和要查询的索引字段，其余字段（translation、context 等）照样会存
// id: 主键 (uuid)；word: 按词查找；due/state: 阶段三复习室按到期时间、状态筛选
db.version(1).stores({
  words: 'id, word, due, state, createdAt',
})

// FSRS 卡片状态（与 ts-fsrs 的 State 枚举一致）
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 }

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

    // ts-fsrs 调度参数：新卡片立即到期（state=New），之后每次复习由 FSRS 更新。
    // 包含设计文档的 due/state/repetition/stability/difficulty，
    // 以及 FSRS 准确调度还需要的 lapses/lastReview/learningSteps/scheduledDays/elapsedDays
    ...newCardFields(now),
  }
}

/** 取出所有已到期（due <= now）的词，最早到期的排前面 */
export function getDueWords(now = new Date()) {
  return db.words.where('due').belowOrEqual(now.toISOString()).sortBy('due')
}

/** 写回一次复习后的调度字段 */
export function saveReview(id, fields) {
  return db.words.update(id, fields)
}

/** 查找同一个词（忽略大小写） */
export function findWord(word) {
  return db.words.where('word').equalsIgnoreCase(word).first()
}

/** 已存在则删除（取消标记），否则新增；返回操作后是否处于已标记状态 */
export async function toggleWord(entry) {
  return db.transaction('rw', db.words, async () => {
    const existing = await findWord(entry.word)
    if (existing) {
      await db.words.delete(existing.id)
      return false
    }
    await db.words.add(createWordRecord(entry))
    return true
  })
}
