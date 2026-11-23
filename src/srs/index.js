import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs'

// FSRS 调度器。enable_fuzz：给较长的间隔加一点随机抖动，避免同一天加的词永远扎堆到期
export const scheduler = fsrs(generatorParameters({ enable_fuzz: true }))

// 复习界面的三个按钮（设计文档：忘记 / 模糊 / 认识）对应 FSRS 的评分
export const GRADES = [
  { rating: Rating.Again, label: '忘记', key: '1', tone: 'rose' },
  { rating: Rating.Hard, label: '模糊', key: '2', tone: 'amber' },
  { rating: Rating.Good, label: '认识', key: '3', tone: 'emerald' },
]

// 评分后如果下次到期时间在 20 分钟内（学习阶段的短间隔），本轮复习里再出现一次（同 Anki 的 learn ahead）
export const LEARN_AHEAD_MS = 20 * 60 * 1000

// 已熟悉：FSRS 的稳定性（大约能记住多少天）达到 30 天的词，正文里不再高亮。
// 一路按「认识」大约在第 4 次复习后达到；之后如果按了「忘记」，稳定性会掉下来，高亮自动恢复
export const FAMILIAR_STABILITY_DAYS = 30
export const isFamiliar = (w) => (w.stability ?? 0) >= FAMILIAR_STABILITY_DAYS

/** 数据库记录 → ts-fsrs 的 Card（旧记录缺字段时补默认值） */
export function toCard(record) {
  return {
    due: new Date(record.due),
    stability: record.stability ?? 0,
    difficulty: record.difficulty ?? 0,
    elapsed_days: record.elapsedDays ?? 0,
    scheduled_days: record.scheduledDays ?? 0,
    learning_steps: record.learningSteps ?? 0,
    reps: record.repetition ?? 0,
    lapses: record.lapses ?? 0,
    state: record.state ?? 0,
    last_review: record.lastReview ? new Date(record.lastReview) : undefined,
  }
}

/** ts-fsrs 的 Card → 要写回数据库的调度字段（日期存 ISO 字符串，方便按 due 索引比较） */
export function fromCard(card) {
  return {
    due: card.due.toISOString(),
    state: card.state,
    repetition: card.reps,
    stability: card.stability,
    difficulty: card.difficulty,
    lapses: card.lapses,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  }
}

/** 新词的初始调度字段 */
export function newCardFields(now = new Date()) {
  return fromCard(createEmptyCard(now))
}

/** 预览每个评分对应的下次复习时间，用于按钮上显示“10 分钟 / 2 天” */
export function previewNext(record, now = new Date()) {
  const preview = scheduler.repeat(toCard(record), now)
  return Object.fromEntries(GRADES.map(({ rating }) => [rating, preview[rating].card.due]))
}

/** 按评分计算新的调度字段 */
export function grade(record, rating, now = new Date()) {
  return fromCard(scheduler.next(toCard(record), now, rating).card)
}

/** 把时间差格式化成 “1 分钟 / 3 小时 / 2 天 / 1.5 个月” */
export function formatInterval(ms) {
  const min = ms / 60000
  if (min < 59.5) return `${Math.max(1, Math.round(min))} 分钟`
  const hours = min / 60
  if (hours < 23.5) return `${Math.round(hours)} 小时`
  const days = hours / 24
  if (days < 29.5) return `${Math.round(days)} 天`
  if (days < 365) return `${+(days / 30).toFixed(1)} 个月`
  return `${+(days / 365).toFixed(1)} 年`
}
