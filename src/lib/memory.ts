/**
 * 记忆聚合逻辑（前端）：读取本地历史 session 的标签，统计频次，
 * 判断是否达到"累计 3 次"的高频问题候选阈值，并结合用户手动声明做合并。
 *
 * 全部为读取时实时计算，不额外存储聚合结果（数据量小，性能足够）。
 */
import type {
  FrequentIssueView,
  PracticeSession,
  TagStatus,
  UserDeclaredIssue,
} from './types.js'

/** 统计所有 session 中每个标签的出现次数 */
export function countTags(sessions: PracticeSession[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    for (const ft of session.feedbackTags) {
      counts.set(ft.tag, (counts.get(ft.tag) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * 计算"我的高频问题"页的完整展示列表（合并规则）：
 *
 * 1. 遍历 PracticeSession 按 feedbackTags 分组计数；
 * 2. 计数 ≥ threshold 的标签成为"高频问题候选"；
 * 3. 候选先查 UserDeclaredIssue（仅 lexicon/predefined 类型参与比对）：
 *    - 命中 → 合并展示为 declared-merged（"你自己提到过 · 系统也发现了 N 次"），
 *      不查 TagStatus、不弹待确认卡片；
 *    - 未命中 → 查 TagStatus 决定 pending/confirmed/dismissed；
 *      TagStatus 里没有记录的候选视为 pending（首次达到阈值）。
 * 4. dismissed 的候选不再主动提醒，但在列表中保留（用户可恢复关注）。
 */
export function computeFrequentIssues(
  sessions: PracticeSession[],
  tagStatuses: TagStatus[],
  declaredIssues: UserDeclaredIssue[],
  threshold: number,
): FrequentIssueView[] {
  const counts = countTags(sessions)
  const statusMap = new Map(tagStatuses.map((t) => [t.tag, t]))
  // 仅 lexicon/predefined 类型参与精确比对
  const declaredByTag = new Map(
    declaredIssues
      .filter((d) => (d.inputType === 'lexicon' || d.inputType === 'predefined') && d.tag)
      .map((d) => [d.tag as string, d]),
  )

  const views: FrequentIssueView[] = []

  for (const [tag, count] of counts) {
    if (count < threshold) continue

    const declared = declaredByTag.get(tag)
    if (declared) {
      views.push({
        tag,
        count,
        status: 'declared-merged',
        declared: true,
        declaredValue: declared.value,
      })
      continue
    }

    const status = statusMap.get(tag)
    views.push({
      tag,
      count,
      status: status?.status ?? 'pending',
      declared: false,
    })
  }

  return views.sort((a, b) => b.count - a.count)
}

/**
 * 反馈结果页用：判断本次触发的标签中，哪些需要展示"确认/忽略"卡片、
 * 哪些命中用户已声明的问题（特别标注）。
 *
 * - 已声明（lexicon/predefined）→ declared: true，不弹确认卡
 * - 已 dismissed → 不再提醒（跳过）
 * - 已 confirmed → 用户已经确认过是自己的问题，不用再问一遍（跳过）
 * - 其余达到阈值的 → 需要确认卡片
 */
export interface SessionTagView {
  tag: string
  count: number
  declared: boolean
  declaredValue?: string
  /** 是否需要展示"确认/忽略"卡片 */
  needsConfirmation: boolean
}

export function classifySessionTags(
  sessionTags: string[],
  sessions: PracticeSession[],
  tagStatuses: TagStatus[],
  declaredIssues: UserDeclaredIssue[],
  threshold: number,
): SessionTagView[] {
  const counts = countTags(sessions)
  const statusMap = new Map(tagStatuses.map((t) => [t.tag, t]))
  const declaredByTag = new Map(
    declaredIssues
      .filter((d) => (d.inputType === 'lexicon' || d.inputType === 'predefined') && d.tag)
      .map((d) => [d.tag as string, d]),
  )

  const seen = new Set<string>()
  const views: SessionTagView[] = []

  for (const tag of sessionTags) {
    if (seen.has(tag)) continue
    seen.add(tag)

    const declared = declaredByTag.get(tag)
    if (declared) {
      views.push({
        tag,
        count: counts.get(tag) ?? 0,
        declared: true,
        declaredValue: declared.value,
        needsConfirmation: false,
      })
      continue
    }

    const status = statusMap.get(tag)
    // 已忽略、或已确认过的问题都已经有过用户的决定，不用再弹确认卡
    if (status?.status === 'dismissed' || status?.status === 'confirmed') continue

    const count = counts.get(tag) ?? 0
    views.push({
      tag,
      count,
      declared: false,
      needsConfirmation: count >= threshold,
    })
  }

  return views
}
