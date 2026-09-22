/**
 * 再练一次对照：把上一次练习摘要校验后塞进 Prompt。
 */
import { ALL_SEMANTIC_TAGS } from '../../src/data/semantic-tags.js'
import { LIMITS } from './types.js'

export interface PreviousAttempt {
  userContent: string
  ideaCompleteness?: string
  nextTip?: string
  risk?: string
  tags: string[]
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

export function sanitizePreviousAttempt(raw: unknown): PreviousAttempt | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  if (!isNonEmptyString(rec.userContent)) return null

  const tags: string[] = []
  if (Array.isArray(rec.tags)) {
    for (const item of rec.tags) {
      if (typeof item === 'string' && ALL_SEMANTIC_TAGS.has(item) && !tags.includes(item)) {
        tags.push(item)
      }
      if (tags.length >= 4) break
    }
  }

  const clip = (v: unknown): string | undefined =>
    isNonEmptyString(v) ? truncate(v.trim(), 400) : undefined

  return {
    userContent: truncate(rec.userContent.trim(), LIMITS.maxPreviousContent),
    ...(clip(rec.ideaCompleteness) ? { ideaCompleteness: clip(rec.ideaCompleteness) } : {}),
    ...(clip(rec.nextTip) ? { nextTip: clip(rec.nextTip) } : {}),
    ...(clip(rec.risk) ? { risk: clip(rec.risk) } : {}),
    tags,
  }
}

export function formatPreviousAttemptBlock(prev: PreviousAttempt): string {
  return `## 同一题 / 同一份材料的上一次练习
上次作答（节选）：
${prev.userContent}

上次「想法完整度」：${prev.ideaCompleteness ?? '（无）'}
上次建议下次先说的那句：${prev.nextTip ?? '（无）'}
上次最大风险：${prev.risk ?? '（无）'}
上次习惯标签：${prev.tags.length > 0 ? prev.tags.join('；') : '（无）'}
`
}

export function comparedWithLastInstruction(hasPrev: boolean): {
  taskItem: string
  jsonField: string
} {
  if (!hasPrev) return { taskItem: '', jsonField: '' }
  return {
    taskItem: `comparedWithLast：跟上一次比。只看上次指出还停在脑子里的那一句，这次有没有说出口。说了就点名那句；没说就写出还能怎么补上（给一句可直接说的话）。不要评分，不要说思维更深了，不要比流利。2-4 句话。`,
    jsonField: `  "comparedWithLast": "...",\n`,
  }
}
