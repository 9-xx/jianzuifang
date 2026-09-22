/**
 * 练习提交编排：词库匹配（瞬时）+ AI 语义判断（异步）→ 两部分都拿到后
 * 合并写入一条 PracticeSession（避免"半条记录"的中间状态）。
 *
 * 展示策略（与存储分离）：
 * - 词库结果瞬时出，可先展示；
 * - AI 部分单独 loading，失败显示"生成失败，点击重试"，不卡词库结果；
 * - 只有 AI 成功返回后才写本地存储（词库 + AI 标签合并成完整 feedbackTags）。
 */
import { matchLexicon, renderFillerWordsFeedback } from './matcher.js'
import { loadDeclaredIssues, loadSessions, saveSessions, generateId } from './storage.js'
import { requestAiFeedback, toDeclaredIssuesPayload } from './api-client.js'
import { findPreviousComparableSession, toPreviousAttempt } from './compare.js'
import type {
  AiFeedbackResponse,
  FeedbackTag,
  InputMethod,
  PracticeMode,
  PracticeSession,
  SimulateSessionMeta,
  SubMode,
} from './types.js'

export interface SubmitParams {
  mode: PracticeMode
  subMode?: SubMode
  scenario: string
  /** 场景配置 id，供「再练一次」还原同一题 */
  scenarioId?: string
  /** 即兴问答当场题目 */
  promptText?: string
  /** 整理总结模式：阅读材料原文 */
  material?: string
  userContent: string
  /** 整理总结：追问题目 */
  followUpQuestions?: string[]
  /** 整理总结：用户对追问的回答 */
  followUpAnswers?: string
  inputMethod: InputMethod
  durationSeconds?: number
  /** 材料模拟：当场对话元数据（材料正文默认不落库） */
  simulate?: SimulateSessionMeta
}

export interface SubmitOutcome {
  session: PracticeSession
  aiFailed: boolean
  aiErrorMessage?: string
}

/** 创建未写入存储的 session 骨架（词库部分已就绪） */
export function buildSessionDraft(params: SubmitParams): {
  draft: PracticeSession
  lexiconTags: FeedbackTag[]
} {
  const declaredIssues = loadDeclaredIssues()
  const lexiconSource = [params.userContent, params.followUpAnswers].filter(Boolean).join('\n')
  const hits = matchLexicon(lexiconSource, declaredIssues)
  const lexiconTags: FeedbackTag[] = hits.map((h) => ({ tag: h.tag, source: 'lexicon' as const }))

  const draft: PracticeSession = {
    id: generateId(),
    mode: params.mode,
    ...(params.subMode ? { subMode: params.subMode } : {}),
    scenario: params.scenario,
    ...(params.scenarioId ? { scenarioId: params.scenarioId } : {}),
    ...(params.promptText ? { promptText: params.promptText } : {}),
    ...(params.material ? { aiGeneratedMaterial: params.material } : {}),
    ...(params.followUpQuestions && params.followUpQuestions.length > 0
      ? { followUpQuestions: params.followUpQuestions }
      : {}),
    ...(params.followUpAnswers ? { followUpAnswers: params.followUpAnswers } : {}),
    createdAt: new Date().toISOString(),
    inputMethod: params.inputMethod,
    userContent: params.userContent,
    feedback: {
      fillerWords: renderFillerWordsFeedback(hits),
    },
    feedbackTags: lexiconTags,
    ...(params.durationSeconds != null ? { durationSeconds: params.durationSeconds } : {}),
    ...(params.simulate ? { simulate: params.simulate } : {}),
  }

  return { draft, lexiconTags }
}

/** 调用 AI 生成语义反馈（可重试） */
export async function fetchAiFeedback(params: SubmitParams): Promise<AiFeedbackResponse> {
  const declaredIssues = loadDeclaredIssues()
  const previous = findPreviousComparableSession({
    mode: params.mode,
    subMode: params.subMode,
    scenario: params.scenario,
    scenarioId: params.scenarioId,
    promptText: params.promptText,
    simulate: params.simulate
      ? {
          savedMaterialId: params.simulate.savedMaterialId,
          sceneType: params.simulate.sceneType,
          brief: params.simulate.brief,
        }
      : undefined,
  })
  return requestAiFeedback({
    userContent: params.userContent,
    scenario: params.scenario,
    mode: params.mode,
    ...(params.subMode ? { subMode: params.subMode } : {}),
    ...(params.material ? { material: params.material } : {}),
    ...(params.followUpQuestions && params.followUpQuestions.length > 0
      ? { followUpQuestions: params.followUpQuestions }
      : {}),
    ...(params.followUpAnswers ? { followUpAnswers: params.followUpAnswers } : {}),
    ...(params.durationSeconds != null ? { durationSeconds: params.durationSeconds } : {}),
    declaredIssues: toDeclaredIssuesPayload(declaredIssues),
    ...(previous ? { previousAttempt: toPreviousAttempt(previous) } : {}),
  })
}

/** 把 AI 结果合并进草稿（不写存储，反馈页容错展示也用） */
export function mergeAiIntoDraft(
  draft: PracticeSession,
  ai: AiFeedbackResponse,
): PracticeSession {
  const aiTags: FeedbackTag[] = ai.tags.map((tag) => ({ tag, source: 'ai' as const }))
  return {
    ...draft,
    feedback: {
      ideaCompleteness: ai.ideaCompleteness,
      opinionIndependence: ai.opinionIndependence,
      logic: ai.logic,
      fluency: ai.fluency,
      structure: ai.structure,
      ...(draft.subMode === '整理总结' && ai.informationCompleteness
        ? { informationCompleteness: ai.informationCompleteness }
        : {}),
      ...(ai.relevance ? { relevance: ai.relevance } : {}),
      ...(ai.highlight ? { highlight: ai.highlight } : {}),
      ...(ai.risk ? { risk: ai.risk } : {}),
      ...(ai.nextTip ? { nextTip: ai.nextTip } : {}),
      ...(ai.comparedWithLast ? { comparedWithLast: ai.comparedWithLast } : {}),
      ...(draft.feedback.fillerWords ? { fillerWords: draft.feedback.fillerWords } : {}),
      encouragement: ai.encouragement,
    },
    feedbackTags: [...draft.feedbackTags, ...aiTags],
  }
}

/**
 * AI 成功后调用：把 AI 反馈与词库结果合并成完整 session 并写入本地存储。
 * 这是唯一写入时机——两部分都拿到才合并，避免半条记录。
 */
export function finalizeAndSaveSession(
  draft: PracticeSession,
  ai: AiFeedbackResponse,
): PracticeSession {
  const session = mergeAiIntoDraft(draft, ai)
  const sessions = loadSessions()
  sessions.unshift(session) // 新记录在前，历史列表按 createdAt 倒序展示
  saveSessions(sessions)
  return session
}
