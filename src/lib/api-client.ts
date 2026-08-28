/**
 * 后端 API 客户端（前端用）。
 * 错误统一抛 ApiClientError，message 为用户可读文案。
 */
import type { AiFeedbackResponse, UserDeclaredIssue } from './types.js'

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
  /** 用户已声明的问题（带入 Prompt 供 AI 特别关注） */
  declaredIssues: Array<{ category: string; value: string; tag?: string }>
}

export function requestAiFeedback(payload: FeedbackRequestPayload): Promise<AiFeedbackResponse> {
  return postJson<AiFeedbackResponse>('/api/feedback', payload)
}

export function requestMaterial(topic: string): Promise<{ material: string }> {
  return postJson<{ material: string }>('/api/generate-material', { topic })
}

/** 把本地声明的问题转成 API 需要的格式（freeform 也带上，供 AI 参考） */
export function toDeclaredIssuesPayload(issues: UserDeclaredIssue[]) {
  return issues.map((d) => ({
    category: d.category,
    value: d.value,
    ...(d.tag ? { tag: d.tag } : {}),
  }))
}
