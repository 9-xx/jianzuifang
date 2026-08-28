/**
 * 语义类标签字典 —— 前后端共用的唯一数据源。
 *
 * - 后端（api/_lib/feedback.ts）：作为 Prompt 的一部分，要求 AI 只能从这个集合里选标签，
 *   返回后做白名单校验。
 * - 前端："我的高频问题"页用户手动声明时，语义类下拉选项用的也是这份字典，
 *   保证用户声明的标签和 AI 打出的标签字符串完全一致，可精确合并比对。
 *
 * 注意：填充词/模糊表达走前端词库匹配，不在这份字典里（词库见 src/data/lexicon.ts）。
 */

export interface SemanticTagCategory {
  /** 问题大类，与 UserDeclaredIssue.category 对应 */
  category: string
  /** 该类别下的预定义标签（完整标签字符串 = `${category}:${label}`） */
  labels: string[]
}

export const SEMANTIC_TAG_CATEGORIES: SemanticTagCategory[] = [
  {
    category: '逻辑结构',
    labels: [
      '缺少结论先行',
      '要点之间没有层次',
      '跑题或答非所问',
      '缺少论据支撑',
      '结尾没有收束',
      '前后表述自相矛盾',
    ],
  },
  {
    category: '紧张点',
    labels: [
      '被追问时语速加快',
      '被追问时声音变小',
      '卡壳后长时间停顿',
      '紧张时重复同一句话',
      '开头紧张明显',
      '紧张时频繁改口',
    ],
  },
  {
    category: '开场白依赖',
    labels: [
      '固定用"嗯…就是"开头',
      '固定用"我觉得"开头',
      '固定用"然后"开头',
      '固定用"其实"开头',
      '开头绕远路不进正题',
    ],
  },
  {
    category: '情绪失衡',
    labels: [
      '全程语气平淡缺乏起伏',
      '过度自我否定',
      '过度道歉或示弱',
      '情绪突然激动',
      '明显缺乏自信',
    ],
  },
]

/** 所有合法的完整标签字符串集合（用于后端白名单校验） */
export const ALL_SEMANTIC_TAGS: ReadonlySet<string> = new Set(
  SEMANTIC_TAG_CATEGORIES.flatMap((c) => c.labels.map((label) => `${c.category}:${label}`)),
)

/** 按类别取该类别下的完整标签列表 */
export function tagsOfCategory(category: string): string[] {
  const found = SEMANTIC_TAG_CATEGORIES.find((c) => c.category === category)
  if (!found) return []
  return found.labels.map((label) => `${category}:${label}`)
}
