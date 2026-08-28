/**
 * 高频问题相关操作：
 * - 确认/忽略系统候选（写 TagStatus）
 * - 手动声明问题（写 UserDeclaredIssue，并顺手清理 TagStatus 冗余记录）
 * - 恢复关注已忽略的候选
 */
import {
  loadDeclaredIssues,
  loadTagStatuses,
  saveDeclaredIssues,
  saveTagStatuses,
  generateId,
} from './storage.js'
import type { DeclaredInputType, TagStatus, TagStatusValue, UserDeclaredIssue } from './types.js'

/** 设置某个标签的确认/忽略状态（upsert） */
export function setTagStatus(tag: string, status: TagStatusValue): void {
  const statuses = loadTagStatuses()
  const now = new Date().toISOString()
  const existing = statuses.find((t) => t.tag === tag)
  if (existing) {
    existing.status = status
    existing.updatedAt = now
  } else {
    statuses.push({ tag, status, updatedAt: now })
  }
  saveTagStatuses(statuses)
}

export interface AddDeclaredIssueParams {
  category: string
  inputType: DeclaredInputType
  value: string
  /** 仅 lexicon/predefined：完整标签字符串 */
  tag?: string
}

/**
 * 新增一条用户手动声明。
 *
 * 合并规则配套动作：若 inputType 为 lexicon/predefined 且该 tag 在 TagStatus 里
 * 已有记录（比如之前用户对系统候选点过"确认"），顺手删掉那条——
 * 以后这个标签都走"合并展示"路径，不再需要 TagStatus 记录。
 */
export function addDeclaredIssue(params: AddDeclaredIssueParams): UserDeclaredIssue {
  const issue: UserDeclaredIssue = {
    id: generateId(),
    category: params.category,
    inputType: params.inputType,
    value: params.value,
    ...(params.tag ? { tag: params.tag } : {}),
    addedAt: new Date().toISOString(),
  }

  const issues = loadDeclaredIssues()
  // 同 tag 去重（重复声明同一问题没有意义）
  if (issue.tag && issues.some((d) => d.tag === issue.tag)) {
    return issues.find((d) => d.tag === issue.tag) as UserDeclaredIssue
  }
  issues.unshift(issue)
  saveDeclaredIssues(issues)

  if (issue.tag) {
    const statuses = loadTagStatuses()
    const cleaned = statuses.filter((t) => t.tag !== issue.tag)
    if (cleaned.length !== statuses.length) {
      saveTagStatuses(cleaned)
    }
  }

  return issue
}

/** 删除一条手动声明 */
export function removeDeclaredIssue(id: string): void {
  const issues = loadDeclaredIssues()
  saveDeclaredIssues(issues.filter((d) => d.id !== id))
}

/** 恢复关注：把 dismissed 的候选移除（回到 pending，下次达到阈值会再提醒） */
export function restoreTagAttention(tag: string): void {
  const statuses = loadTagStatuses()
  saveTagStatuses(statuses.filter((t) => !(t.tag === tag && t.status === 'dismissed')))
}

/** 清空全部高频问题记忆（破坏性操作，调用方需二次确认） */
export function clearAllMemory(): void {
  saveTagStatuses([] as TagStatus[])
  saveDeclaredIssues([])
}
