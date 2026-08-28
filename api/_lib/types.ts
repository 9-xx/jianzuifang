/** API 层共享的极简类型（不依赖任何运行时框架，Vercel 与本地 dev-server 共用） */

export interface ApiRequest {
  method: string
  path: string
  /** 原始请求体字符串（由调用方读出） */
  body: string
  headers: Record<string, string | undefined>
}

export interface ApiResponseWriter {
  /** 以 JSON 写回响应并结束 */
  json(status: number, payload: unknown): void
}

/** 限流配置：每个 IP 在窗口期内允许的最大请求数 */
export const RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
} as const

/** 输入长度上限（字符），防止超长输入导致 token 成本失控 */
export const LIMITS = {
  maxUserContent: 5_000,
  maxMaterial: 8_000,
  maxTopicLength: 100,
  maxDeclaredIssues: 50,
} as const
