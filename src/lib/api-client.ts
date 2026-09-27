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
import { loadUserApiKey } from './user-key.js'

export class ApiClientError extends Error {
  /** 是否可重试（网络/服务端错误可重试，参数错误不可） */
  retryable: boolean
  /** 需要访客配置 Key（BYOK：引导用户去填自己的 Key） */
  keyRequired: boolean
  constructor(message: string, retryable: boolean, keyRequired = false) {
    super(message)
    this.name = 'ApiClientError'
    this.retryable = retryable
    this.keyRequired = keyRequired
  }
}

/** 纯 BYOK 部署：没填 Key 就不发请求，直接给出可操作的提示 */
function requireLocalKey(): string {
  const key = loadUserApiKey()
  if (!key) {
    throw new ApiClientError(
      '还没有填写 DeepSeek API Key。点右上角「Key」填入你自己的 Key 后重试（只存本机，本站不会保存）',
      true,
      true,
    )
  }
  return key
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  // 纯 BYOK：Key 必填，随请求头带给后端，仅当次使用
  const userKey = requireLocalKey()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-User-Key': userKey }

  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiClientError('网络异常，请检查连接后重试', true)
  }

  let data: { error?: string; keyRequired?: boolean } & Record<string, unknown>
  try {
    data = (await res.json()) as { error?: string; keyRequired?: boolean } & Record<string, unknown>
  } catch {
    throw new ApiClientError('服务返回异常，请重试', true)
  }

  if (!res.ok) {
    const keyRequired = data.keyRequired === true
    throw new ApiClientError(
      data.error ?? `请求失败（${res.status}）`,
      keyRequired || res.status >= 500 || res.status === 429,
      keyRequired,
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
