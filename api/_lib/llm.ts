/**
 * DeepSeek API 客户端（OpenAI 兼容 chat/completions 接口）。
 *
 * 安全约定：
 * - API Key 只在服务端使用，绝不写进代码、绝不返回给前端、不做任何持久化。
 * - 本部署为纯 BYOK 模式：仅使用访客随请求头自带的 Key（X-User-Key），
 *   服务端不配置共享 Key。访客没填或格式不对时报 LlmConfigError。
 */
import process from 'node:process'

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
const TIMEOUT_MS = 50_000

/** 访客自带 Key 的请求头名 */
export const USER_KEY_HEADER = 'x-user-key'

/** DeepSeek Key 的基本格式（用于快速拦截明显无效的输入） */
const KEY_PATTERN = /^sk-[A-Za-z0-9]{16,}$/

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 提取请求头里访客自带的 Key。
 * 缺失返回 null（缺 Key）；有值但格式无效则抛 LlmConfigError('user')，
 * 让调用方明确告知访客「Key 填错了」，而不是静默当作没填。
 */
export function requireUserKey(headers: Record<string, string | undefined>): string {
  const raw = headers[USER_KEY_HEADER] ?? headers[USER_KEY_HEADER.toLowerCase()]
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new LlmConfigError('missing')
  }
  const key = raw.trim()
  if (!KEY_PATTERN.test(key)) {
    throw new LlmConfigError('invalid')
  }
  return key
}

export type LlmKeyIssue = 'missing' | 'invalid'

export class LlmConfigError extends Error {
  /** 访客 Key 的问题：'missing' 没填；'invalid' 格式不对 */
  source: LlmKeyIssue
  constructor(source: LlmKeyIssue = 'missing') {
    super(source === 'invalid' ? '访客提供的 API Key 格式无效' : '访客未提供 API Key')
    this.name = 'LlmConfigError'
    this.source = source
  }
}

export class LlmCallError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmCallError'
  }
}

interface ChatOptions {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  /** 强制 JSON 输出（DeepSeek 支持 response_format: json_object） */
  jsonMode?: boolean
}

/** 调用 DeepSeek chat/completions，返回助手回复文本。失败抛 LlmCallError。 */
export async function chat(opts: ChatOptions & { userKey: string }): Promise<string> {
  const apiKey = opts.userKey

  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 2000,
        ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new LlmCallError(`DeepSeek API 返回 ${res.status}: ${text.slice(0, 300)}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content === '') {
      throw new LlmCallError('DeepSeek API 返回了空内容')
    }
    return content
  } catch (err) {
    if (err instanceof LlmCallError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmCallError('DeepSeek API 请求超时')
    }
    throw new LlmCallError(err instanceof Error ? err.message : '调用 DeepSeek API 失败')
  } finally {
    clearTimeout(timer)
  }
}

/** 从模型回复中提取 JSON 对象（容忍 ```json 包裹等常见格式噪音）。 */
export function parseJsonReply<T>(raw: string): T {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) text = fence[1].trim()

  try {
    return JSON.parse(text) as T
  } catch {
    // 兜底：截取第一个 { 到最后一个 } 之间再试一次
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T
    }
    throw new LlmCallError('模型返回的内容不是有效 JSON')
  }
}
