/**
 * 表达习惯的主次分类。
 *
 * 记忆系统要记的是「想法有没有说出来」，填充词只是辅助。
 * 分类只用于展示和排序，不改存储结构。
 */
export type HabitFamily = 'thought' | 'wording' | 'presence'

export const HABIT_FAMILY_META: Record<HabitFamily, { title: string; hint: string }> = {
  thought: { title: '想法没说完整', hint: '结论、判断、说到一半收回、有没有落到材料上' },
  wording: { title: '用词习惯', hint: '填充词、模糊表达、固定开场' },
  presence: { title: '临场状态', hint: '紧张、情绪' },
}

const FAMILY_RANK: Record<HabitFamily, number> = {
  thought: 0,
  wording: 1,
  presence: 2,
}

/** 思维外化标签优先于同族其他逻辑结构标签 */
const THOUGHT_PRIORITY = [
  '逻辑结构:核心想法没有说出口',
  '逻辑结构:没有亮出自己的判断',
  '逻辑结构:判断说到一半收回',
  '逻辑结构:追问时答不上细节',
  '逻辑结构:缺少结论先行',
  '针对性:回答脱离材料',
  '针对性:只谈共性没有落到这份材料',
  '针对性:被追问细节时改口',
]

export function habitFamilyOf(tag: string): HabitFamily {
  const category = tag.includes(':') ? tag.slice(0, tag.indexOf(':')) : tag
  if (category === '填充词' || category === '模糊表达' || category === '开场白依赖') {
    return 'wording'
  }
  if (category === '紧张点' || category === '情绪失衡') {
    return 'presence'
  }
  return 'thought'
}

export function habitFamilyOfCategory(category: string): HabitFamily {
  return habitFamilyOf(`${category}:x`)
}

export function habitLabel(tag: string): string {
  const i = tag.indexOf(':')
  return i === -1 ? tag : tag.slice(i + 1)
}

function thoughtPriority(tag: string): number {
  const i = THOUGHT_PRIORITY.indexOf(tag)
  return i === -1 ? 80 : i
}

export function compareHabitTags(a: string, b: string): number {
  const familyDiff = FAMILY_RANK[habitFamilyOf(a)] - FAMILY_RANK[habitFamilyOf(b)]
  if (familyDiff !== 0) return familyDiff
  const priorityDiff = thoughtPriority(a) - thoughtPriority(b)
  if (priorityDiff !== 0) return priorityDiff
  return a.localeCompare(b, 'zh')
}

export function compareHabitTagsByCount(
  a: { tag: string; count: number },
  b: { tag: string; count: number },
): number {
  const familyDiff = FAMILY_RANK[habitFamilyOf(a.tag)] - FAMILY_RANK[habitFamilyOf(b.tag)]
  if (familyDiff !== 0) return familyDiff
  const priorityDiff = thoughtPriority(a.tag) - thoughtPriority(b.tag)
  if (priorityDiff !== 0) return priorityDiff
  return b.count - a.count
}
