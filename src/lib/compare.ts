/**
 * 再练一次的对照：找到同一题 / 同一份材料的上一次记录，抽出给 AI 用的摘要。
 * 不比流利、不比「思维深度」，只看上次没说出口的那句这次有没有补上。
 */
import { habitFamilyOf } from './habits.js'
import { loadSessions } from './storage.js'
import type { PracticeSession } from './types.js'

export interface SessionMatchInput {
  mode: string
  subMode?: string
  scenario?: string
  scenarioId?: string
  /** 即兴问答当场题目；有值时只对照同一题 */
  promptText?: string
  simulate?: {
    savedMaterialId?: string
    sceneType?: string
    brief?: string
  }
}

export interface PreviousAttemptPayload {
  userContent: string
  ideaCompleteness?: string
  nextTip?: string
  risk?: string
  tags: string[]
}

const PREV_CONTENT = 1200
const PREV_FIELD = 400

function normalize(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

export function sessionsMatchForCompare(a: SessionMatchInput, b: SessionMatchInput): boolean {
  if (a.mode !== b.mode) return false

  if (a.mode === '材料模拟') {
    const idA = a.simulate?.savedMaterialId
    const idB = b.simulate?.savedMaterialId
    if (idA && idB) return idA === idB
    const sceneOk =
      Boolean(a.simulate?.sceneType) && a.simulate?.sceneType === b.simulate?.sceneType
    if (!sceneOk) return false
    const keyA = normalize(a.simulate?.brief) || normalize(a.scenario)
    const keyB = normalize(b.simulate?.brief) || normalize(b.scenario)
    return keyA !== '' && keyA === keyB
  }

  if (a.scenarioId && b.scenarioId && a.scenarioId !== b.scenarioId) return false
  if (a.subMode || b.subMode) {
    if (a.subMode !== b.subMode) return false
  }
  if (a.scenarioId && b.scenarioId) {
    if (a.mode === '即兴问答' && a.promptText) {
      return Boolean(b.promptText) && a.promptText === b.promptText
    }
    return true
  }
  if (normalize(a.scenario) && normalize(a.scenario) === normalize(b.scenario)) {
    if (a.mode === '即兴问答' && a.promptText) {
      return Boolean(b.promptText) && a.promptText === b.promptText
    }
    return true
  }
  return false
}

function hasComparableFeedback(session: PracticeSession): boolean {
  const f = session.feedback
  return Boolean(f.ideaCompleteness || f.nextTip || f.risk || f.opinionIndependence)
}

export function toPreviousAttempt(session: PracticeSession): PreviousAttemptPayload {
  const tags = session.feedbackTags
    .map((t) => t.tag)
    .filter((tag) => habitFamilyOf(tag) === 'thought')
    .slice(0, 4)
  return {
    userContent: session.userContent.slice(0, PREV_CONTENT),
    ...(session.feedback.ideaCompleteness
      ? { ideaCompleteness: session.feedback.ideaCompleteness.slice(0, PREV_FIELD) }
      : {}),
    ...(session.feedback.nextTip ? { nextTip: session.feedback.nextTip.slice(0, PREV_FIELD) } : {}),
    ...(session.feedback.risk ? { risk: session.feedback.risk.slice(0, PREV_FIELD) } : {}),
    tags,
  }
}

/** 同一题/同一材料里，比当前更早的最近一次（当前尚未落库时不传 excludeId） */
export function findPreviousComparableSession(
  current: SessionMatchInput,
  excludeId?: string,
): PracticeSession | null {
  const sessions = loadSessions()
    .filter((s) => s.id !== excludeId && hasComparableFeedback(s))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  for (const s of sessions) {
    if (
      sessionsMatchForCompare(current, {
        mode: s.mode,
        subMode: s.subMode,
        scenario: s.scenario,
        scenarioId: s.scenarioId,
        promptText: s.promptText,
        simulate: s.simulate
          ? {
              savedMaterialId: s.simulate.savedMaterialId,
              sceneType: s.simulate.sceneType,
              brief: s.simulate.brief,
            }
          : undefined,
      })
    ) {
      return s
    }
  }
  return null
}
