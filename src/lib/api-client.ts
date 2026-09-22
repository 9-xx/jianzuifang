/**
 * 后端 API 客户端（前端用）。
 * 错误统一抛 ApiClientError，message 为用户可读文案。
 */
import type {
  AiFeedbackResponse,
  SimulateDimension,
  SimulatePersona,
  SimulateSceneType,
  SimulateTurn,
  UserDeclaredIssue,
} from './types.js'

export class ApiClientError extends Error {
  /** 是否可重试（网络/服务端错误可重试，参数错误不可） */
  retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'ApiClientError'
    this.retryable = retryable
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiClientError('网络异常，请检查连接后重试', true)
  }

  let data: { error?: string } & Record<string, unknown>
  try {
    data = (await res.json()) as { error?: string } & Record<string, unknown>
  } catch {
    throw new ApiClientError('服务返回异常，请重试', true)
  }

  if (!res.ok) {
    throw new ApiClientError(
      data.error ?? `请求失败（${res.status}）`,
      res.status >= 500 || res.status === 429,
    )
  }
  return data as T
}

export interface FeedbackRequestPayload {
  userContent: string
  scenario: string
  mode: string
  subMode?: string
  durationSeconds?: number
  /** 整理总结模式：阅读材料原文（后端用于判信息保留完整度，不落库） */
  material?: string
  /** 整理总结：追问题目 */
  followUpQuestions?: string[]
  /** 整理总结：用户对追问的回答 */
  followUpAnswers?: string
  /** 用户已声明的问题（带入 Prompt 供 AI 特别关注） */
  declaredIssues: Array<{ category: string; value: string; tag?: string }>
  /** 同一题/同一材料的上一次摘要（再练一次对照） */
  previousAttempt?: {
    userContent: string
    ideaCompleteness?: string
    nextTip?: string
    risk?: string
    tags: string[]
  }
}

export function requestAiFeedback(payload: FeedbackRequestPayload): Promise<AiFeedbackResponse> {
  return postJson<AiFeedbackResponse>('/api/feedback', payload)
}

export function requestMaterial(topic: string): Promise<{ material: string }> {
  return postJson<{ material: string }>('/api/generate-material', { topic })
}

export function requestFollowUp(payload: {
  material: string
  userContent: string
  topic?: string
}): Promise<{ questions: string[] }> {
  return postJson<{ questions: string[] }>('/api/follow-up', payload)
}

export interface SimulatePrepareResult {
  dimensions: SimulateDimension[]
  opening: string
}

export interface SimulateTurnResult {
  reply: string
  forceEnd: boolean
}

export interface SimulateReviewResult extends AiFeedbackResponse {
  relevance: string
  highlight: string
  risk: string
  nextTip: string
}

interface SimulateBasePayload {
  sceneType: SimulateSceneType
  persona: SimulatePersona
  brief?: string
  material: string
}

export function requestSimulatePrepare(
  payload: SimulateBasePayload,
): Promise<SimulatePrepareResult> {
  return postJson<SimulatePrepareResult>('/api/simulate', { action: 'prepare', ...payload })
}

export function requestSimulateTurn(
  payload: SimulateBasePayload & {
    dimensions: SimulateDimension[]
    transcript: SimulateTurn[]
  },
): Promise<SimulateTurnResult> {
  return postJson<SimulateTurnResult>('/api/simulate', { action: 'turn', ...payload })
}

export function requestSimulateReview(
  payload: SimulateBasePayload & {
    dimensions: SimulateDimension[]
    transcript: SimulateTurn[]
    previousAttempt?: {
      userContent: string
      ideaCompleteness?: string
      nextTip?: string
      risk?: string
      tags: string[]
    }
  },
): Promise<SimulateReviewResult> {
  return postJson<SimulateReviewResult>('/api/simulate', { action: 'review', ...payload })
}

/** 把本地声明的问题转成 API 需要的格式（freeform 也带上，供 AI 参考） */
export function toDeclaredIssuesPayload(issues: UserDeclaredIssue[]) {
  return issues.map((d) => ({
    category: d.category,
    value: d.value,
    ...(d.tag ? { tag: d.tag } : {}),
  }))
}
