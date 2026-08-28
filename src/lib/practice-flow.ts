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
import { loadDeclaredIssues, loadSessions, loadTagStatuses, saveSessions, generateId } from './storage.js'
import { requestAiFeedback, toDeclaredIssuesPayload, ApiClientError } from './api-client.js'
import type {
  AiFeedbackResponse,
  FeedbackTag,
  InputMethod,
  PracticeMode,
  PracticeSession,
  SubMode,
} from './types.js'

export interface SubmitParams {
  mode: PracticeMode
  subMode?: SubMode
  scenario: string
  /** 整理总结模式：阅读材料原文 */
  material?: string
  userContent: string
  inputMethod: InputMethod
  durationSeconds?: number
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
  const hits = matchLexicon(params.userContent, declaredIssues)
  const lexiconTags: FeedbackTag[] = hits.map((h) => ({ tag: h.tag, source: 'lexicon' as const }))

  const draft: PracticeSession = {
    id: generateId(),
    mode: params.mode,
    ...(params.subMode ? { subMode: params.subMode } : {}),
    scenario: params.scenario,
    ...(params.material ? { aiGeneratedMaterial: params.material } : {}),
    createdAt: new Date().toISOString(),
    inputMethod: params.inputMethod,
    userContent: params.userContent,
    feedback: {
      fillerWords: renderFillerWordsFeedback(hits),
    },
    feedbackTags: lexiconTags,
    ...(params.durationSeconds != null ? { durationSeconds: params.durationSeconds } : {}),
  }

  return { draft, lexiconTags }
}

/** 调用 AI 生成语义反馈（可重试） */
export async function fetchAiFeedback(params: SubmitParams): Promise<AiFeedbackResponse> {
  const declaredIssues = loadDeclaredIssues()
  return requestAiFeedback({
    userContent: params.userContent,
    scenario: params.scenario,
    mode: params.mode,
    ...(params.subMode ? { subMode: params.subMode } : {}),
    ...(params.material ? { material: params.material } : {}),
    ...(params.durationSeconds != null ? { durationSeconds: params.durationSeconds } : {}),
    declaredIssues: toDeclaredIssuesPayload(declaredIssues),
  })
}

/**
 * AI 成功后调用：把 AI 反馈与词库结果合并成完整 session 并写入本地存储。
 * 这是唯一写入时机——两部分都拿到才合并，避免半条记录。
 */
export function finalizeAndSaveSession(
  draft: PracticeSession,
  ai: AiFeedbackResponse,
): PracticeSession {
  const aiTags: FeedbackTag[] = ai.tags.map((tag) => ({ tag, source: 'ai' as const }))

  const session: PracticeSession = {
    ...draft,
    feedback: {
      logic: ai.logic,
      fluency: ai.fluency,
      structure: ai.structure,
      ...(draft.subMode === '整理总结'
        ? {
            informationCompleteness: ai.informationCompleteness,
            opinionIndependence: ai.opinionIndependence,
          }
        : {}),
      ...(draft.feedback.fillerWords ? { fillerWords: draft.feedback.fillerWords } : {}),
      encouragement: ai.encouragement,
    },
    feedbackTags: [...draft.feedbackTags, ...aiTags],
  }

  const sessions = loadSessions()
  sessions.unshift(session) // 新记录在前，历史列表按 createdAt 倒序展示
  saveSessions(sessions)
  return session
}

/** AI 失败时的重试入口：返回 null 表示仍失败（错误信息在 ApiClientError 里） */
export async function retryAiFeedback(
  params: SubmitParams,
): Promise<{ ai: AiFeedbackResponse } | { error: ApiClientError }> {
  try {
    const ai = await fetchAiFeedback(params)
    return { ai }
  } catch (err) {
    return {
      error:
        err instanceof ApiClientError
          ? err
          : new ApiClientError('生成反馈失败，点击重试', true),
    }
  }
}

/** 便捷函数：读取当前所有 TagStatus（反馈页确认卡片用） */
export function currentTagStatuses() {
  return loadTagStatuses()
}
