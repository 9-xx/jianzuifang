/**
 * 成长记录"文字总结"的计算逻辑（MVP 不做图表，实时计算不落库）：
 *
 * - 问题标签频率变化：历史按时间分"最近 N 次"和"更早的 N 次"（N=5），
 *   找出降幅最明显的 1-2 个标签；
 * - 新增问题提醒："最近 N 次"出现了"更早 N 次"完全没有过的标签；
 * - 高频问题消失提醒：检查范围 = TagStatus 中 confirmed 的标签
 *   + UserDeclaredIssue 中 lexicon/predefined 的 tag（合并路径不进 TagStatus，
 *   但同样要纳入检查，否则会漏掉这部分问题的"消失"）。
 *   某标签最近连续 M 次（M=5）练习的 feedbackTags 都不再包含 → 提示。
 */
import type { PracticeSession, TagStatus, UserDeclaredIssue } from './types.js'
import { habitFamilyOf, habitLabel } from './habits.js'

const N = 5
const M = 5

export interface GrowthSummary {
  /** 频率下降的进步句子 */
  improvements: string[]
  /** 新增问题提醒 */
  newIssues: string[]
  /** 高频问题消失的正向反馈 */
  disappeared: string[]
  /** 是否有足够数据生成总结 */
  hasData: boolean
}

/** 按 createdAt 升序排序（旧 → 新） */
function sortByTime(sessions: PracticeSession[]): PracticeSession[] {
  return [...sessions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

function tagSet(session: PracticeSession): Set<string> {
  return new Set(session.feedbackTags.map((ft) => ft.tag))
}

export function computeGrowthSummary(
  sessions: PracticeSession[],
  tagStatuses: TagStatus[],
  declaredIssues: UserDeclaredIssue[],
): GrowthSummary {
  const sorted = sortByTime(sessions)
  if (sorted.length === 0) {
    return { improvements: [], newIssues: [], disappeared: [], hasData: false }
  }

  const recent = sorted.slice(-N)
  // "更早的 N 次"是紧邻 recent 之前的 N 次，不是除 recent 外的全部历史——
  // 否则 earlier 会随总场次无限增长，导致哪怕频率毫无变化也会被判定为"进步"。
  const earlier =
    sorted.length > N ? sorted.slice(Math.max(0, sorted.length - 2 * N), -N) : []

  const recentCounts = new Map<string, number>()
  for (const s of recent) {
    for (const ft of s.feedbackTags) {
      recentCounts.set(ft.tag, (recentCounts.get(ft.tag) ?? 0) + 1)
    }
  }
  const earlierCounts = new Map<string, number>()
  for (const s of earlier) {
    for (const ft of s.feedbackTags) {
      earlierCounts.set(ft.tag, (earlierCounts.get(ft.tag) ?? 0) + 1)
    }
  }

  // ---- 频率变化：优先思维外化习惯，最多 2 条 ----
  const improvements: string[] = []
  const drops = [...recentCounts.entries()]
    .map(([tag, recentCount]) => {
      const earlierCount = earlier.length > 0 ? (earlierCounts.get(tag) ?? 0) : recentCount
      return { tag, recentCount, earlierCount, drop: earlierCount - recentCount }
    })
    .filter((d) => d.drop > 0)
    .sort((a, b) => b.drop - a.drop)

  const pickedDrops: typeof drops = []
  const topThought = drops.find((d) => habitFamilyOf(d.tag) === 'thought')
  if (topThought) pickedDrops.push(topThought)
  for (const d of drops) {
    if (pickedDrops.length >= 2) break
    if (!pickedDrops.includes(d)) pickedDrops.push(d)
  }

  for (const d of pickedDrops) {
    improvements.push(improvementLine(d.tag, d.drop, d.earlierCount, d.recentCount, recent.length))
  }

  // ---- 新增习惯提醒：思维外化优先，最多 3 条 ----
  const newIssues: string[] = []
  if (earlier.length > 0) {
    const newcomers = [...recentCounts.keys()]
      .filter((tag) => (earlierCounts.get(tag) ?? 0) === 0)
      .sort((a, b) => {
        const fa = habitFamilyOf(a) === 'thought' ? 0 : 1
        const fb = habitFamilyOf(b) === 'thought' ? 0 : 1
        if (fa !== fb) return fa - fb
        return (recentCounts.get(b) ?? 0) - (recentCounts.get(a) ?? 0)
      })
      .slice(0, 3)
    for (const tag of newcomers) {
      newIssues.push(newIssueLine(tag))
    }
  }

  // ---- 高频问题消失提醒 ----
  const disappeared: string[] = []
  const confirmedTags = new Set(tagStatuses.filter((t) => t.status === 'confirmed').map((t) => t.tag))
  for (const d of declaredIssues) {
    if ((d.inputType === 'lexicon' || d.inputType === 'predefined') && d.tag) {
      confirmedTags.add(d.tag)
    }
  }

  if (confirmedTags.size > 0 && sorted.length >= M) {
    const lastM = sorted.slice(-M)
    const lastMSets = lastM.map(tagSet)
    for (const tag of confirmedTags) {
      const stillPresent = lastMSets.some((set) => set.has(tag))
      if (!stillPresent) {
        disappeared.push(disappearedLine(tag, M))
      }
    }
  }

  return { improvements, newIssues, disappeared, hasData: true }
}

function improvementLine(
  tag: string,
  drop: number,
  earlierCount: number,
  recentCount: number,
  recentLen: number,
): string {
  const name = habitLabel(tag)
  const half = earlierCount > 0 && recentCount <= earlierCount / 2
  const family = habitFamilyOf(tag)
  if (family === 'thought') {
    return half
      ? `「${name}」最近 ${recentLen} 次比之前少了一半以上，想法越来越能说完整。`
      : `「${name}」最近 ${recentLen} 次比之前少了 ${drop} 次，继续把判断说出来。`
  }
  if (family === 'wording') {
    return half
      ? `「${name}」最近 ${recentLen} 次比之前少了一半以上，用词更干净了。`
      : `「${name}」最近 ${recentLen} 次比之前少了 ${drop} 次，继续保持。`
  }
  return half
    ? `「${name}」最近 ${recentLen} 次比之前少了一半以上，临场更稳了。`
    : `「${name}」最近 ${recentLen} 次比之前少了 ${drop} 次，继续保持。`
}

function newIssueLine(tag: string): string {
  const name = habitLabel(tag)
  if (habitFamilyOf(tag) === 'thought') {
    return `最近常出现：「${name}」。下次开口时先把那句判断说出来。`
  }
  if (habitFamilyOf(tag) === 'wording') {
    return `最近常出现用词习惯：「${name}」，可以留意一下。`
  }
  return `最近常出现：「${name}」，可以留意一下。`
}

function disappearedLine(tag: string, m: number): string {
  const name = habitLabel(tag)
  if (habitFamilyOf(tag) === 'thought') {
    return `你盯着的「${name}」最近 ${m} 次都没再出现，想法说得更完整了。`
  }
  return `你盯着的「${name}」最近 ${m} 次练习都没再出现了，很棒！`
}
