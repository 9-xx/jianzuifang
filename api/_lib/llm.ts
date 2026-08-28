/**
 * DeepSeek API 客户端（OpenAI 兼容 chat/completions 接口）。
 *
 * 安全约定：
 * - API Key 只从服务端环境变量读取，绝不写进代码、绝不返回给前端。
 * - 请求处理完即丢弃，不做任何持久化。
 */
import process from 'node:process'

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
const TIMEOUT_MS = 50_000

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function getApiKey(): string | null {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key || key === 'your_key_here' || key.trim() === '') return null
  return key.trim()
}

export class LlmConfigError extends Error {
  constructor() {
    super('LLM 未配置：缺少 DEEPSEEK_API_KEY 环境变量')
    this.name = 'LlmConfigError'
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
export async function chat(opts: ChatOptions): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new LlmConfigError()

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
