/**
 * 练习统计（实时计算，不落库）：
 * - 总次数 / 总分钟数
 * - 连续天数（streak）：按"自然日是否有练习"计算，今天或昨天有就算连续中
 * - 最近一次练习距今的鼓励文案
 *
 * 全部从 sessions 派生，存储层零改动。
 */
import type { PracticeSession } from './types.js'

export interface PracticeStats {
  totalCount: number
  /** 累计作答秒数（无时长数据的记录按 0 计） */
  totalSeconds: number
  /** 连续练习天数（今天/昨天截止的连续自然日数） */
  streakDays: number
  /** 最近一次练习的 ISO 时间；没有则为 null */
  lastPracticedAt: string | null
  /** 是否今天已经练过 */
  practicedToday: boolean
}

/** 取某天的 0 点（本地时区）时间戳 */
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 一天的毫秒数 */
const DAY_MS = 24 * 60 * 60 * 1000

export function computePracticeStats(sessions: PracticeSession[]): PracticeStats {
  const now = new Date()
  const todayStart = dayStart(now)

  const days = new Set<number>()
  let totalSeconds = 0
  let lastAt: number | null = null

  for (const s of sessions) {
    const t = new Date(s.createdAt).getTime()
    if (Number.isNaN(t)) continue
    days.add(dayStart(new Date(t)))
    if (s.durationSeconds != null && Number.isFinite(s.durationSeconds)) {
      totalSeconds += s.durationSeconds
    }
    if (lastAt == null || t > lastAt) lastAt = t
  }

  // streak：从今天开始往回数连续自然日；今天没练则从昨天开始数
  let streakDays = 0
  if (days.size > 0) {
    let cursor = days.has(todayStart) ? todayStart : todayStart - DAY_MS
    while (days.has(cursor)) {
      streakDays += 1
      cursor -= DAY_MS
    }
  }

  return {
    totalCount: sessions.length,
    totalSeconds,
    streakDays,
    lastPracticedAt: lastAt != null ? new Date(lastAt).toISOString() : null,
    practicedToday: days.has(todayStart),
  }
}

/** 距上次练习的人性化描述 */
export function lastPracticeLabel(stats: PracticeStats): string | null {
  if (stats.lastPracticedAt == null) return null
  if (stats.practicedToday) return '今天已经开口练过了，很棒'
  const diffDays = Math.floor(
    (dayStart(new Date()) - dayStart(new Date(stats.lastPracticedAt))) / DAY_MS,
  )
  if (diffDays <= 1) return '昨天练过，今天再开一次口'
  if (diffDays <= 3) return `有 ${diffDays} 天没练了，回来把话说完整`
  if (diffDays <= 7) return '一周没练，嘴也该做做有氧了'
  return '好久没练了，先从一句话开始'
}

/** 累计时长的友好显示（如 "12 分钟" / "1.5 小时"） */
export function totalDurationLabel(stats: PracticeStats): string {
  const minutes = Math.round(stats.totalSeconds / 60)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} 小时`
}
