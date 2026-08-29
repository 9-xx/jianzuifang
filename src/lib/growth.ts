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

  // ---- 频率变化：降幅最明显的 1-2 个标签 ----
  const improvements: string[] = []
  const drops = [...recentCounts.entries()]
    .map(([tag, recentCount]) => {
      const earlierCount = earlier.length > 0 ? (earlierCounts.get(tag) ?? 0) : recentCount
      return { tag, recentCount, earlierCount, drop: earlierCount - recentCount }
    })
    .filter((d) => d.drop > 0)
    .sort((a, b) => b.drop - a.drop)
    .slice(0, 2)

  for (const d of drops) {
    const half = d.earlierCount > 0 && d.recentCount <= d.earlierCount / 2
    improvements.push(
      half
        ? `你的「${d.tag}」问题最近 ${recent.length} 次比之前少了一半以上，进步明显！`
        : `你的「${d.tag}」问题最近 ${recent.length} 次比之前减少了 ${d.drop} 次，继续保持！`,
    )
  }

  // ---- 新增问题提醒（需要有"更早"的数据才谈得上"新增"，数据不够时不判断） ----
  const newIssues: string[] = []
  if (earlier.length > 0) {
    for (const [tag] of recentCounts) {
      if ((earlierCounts.get(tag) ?? 0) === 0) {
        newIssues.push(`最近新出现了一个问题：「${tag}」，可以留意一下。`)
      }
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
        disappeared.push(`你之前关注的问题「${tag}」最近 ${M} 次练习都没再出现了，很棒！`)
      }
    }
  }

  return { improvements, newIssues, disappeared, hasData: true }
}
