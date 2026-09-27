/**
 * POST /api/follow-up —— 整理总结之后的短追问。
 *
 * 输入：阅读材料 + 用户总结。
 * 输出：1-2 道具体追问，用来检验是真理解还是在复述。
 *
 * 无状态：请求处理完即丢弃，不落库。
 */
import { chat, parseJsonReply, requireUserKey, LlmConfigError, LlmCallError, type LlmKeyIssue } from './llm.js'
import { checkRateLimit } from './rate-limit.js'
import { LIMITS, type ApiRequest, type ApiResponseWriter } from './types.js'

interface FollowUpRequestBody {
  material?: unknown
  userContent?: unknown
  topic?: unknown
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

/** 503 统一响应：按访客 Key 的问题分流文案 */
function keyRequiredPayload(issue: LlmKeyIssue): { error: string; keyRequired: true } {
  return {
    error:
      issue === 'invalid'
        ? '你填写的 API Key 格式不对：应以 sk- 开头，后面跟一串字母数字。请点右上角「Key」检查后重试'
        : '还没有填写 DeepSeek API Key。点右上角「Key」填入你自己的 Key 后重试（只存本机，本站不会保存）',
    keyRequired: true,
  }
}

function sanitizeQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const q = item.replace(/\s+/g, ' ').trim()
    if (q.length < 6 || q.length > 120) continue
    out.push(q)
    if (out.length >= 2) break
  }
  return out
}

export async function handleFollowUp(
  req: ApiRequest,
  res: ApiResponseWriter,
): Promise<boolean> {
  if (req.path !== '/api/follow-up') return false

  if (!checkRateLimit(req.headers)) {
    res.json(429, { error: '请求太频繁了，请稍等一分钟再试' })
    return true
  }

  // 纯 BYOK：先验访客 Key
  let userKey: string
  try {
    userKey = requireUserKey(req.headers)
  } catch (err) {
    if (err instanceof LlmConfigError) {
      res.json(503, keyRequiredPayload(err.source))
      return true
    }
    throw err
  }

  let body: FollowUpRequestBody
  try {
    body = JSON.parse(req.body) as FollowUpRequestBody
  } catch {
    res.json(400, { error: '请求体不是有效 JSON' })
    return true
  }

  if (!isNonEmptyString(body.material) || !isNonEmptyString(body.userContent)) {
    res.json(400, { error: '缺少阅读材料或总结内容' })
    return true
  }

  const topic = isNonEmptyString(body.topic) ? truncate(body.topic.trim(), LIMITS.maxTopicLength) : ''

  try {
    const raw = await chat({
      userKey,
      messages: [
        {
          role: 'system',
          content:
            '你是一位当面追问的表达教练。你的追问短、具体、口语化，目的是检验对方是真的理解了材料，还是只把刚才那段话背了下来。不要评价总结写得好不好，不要表扬，不要闲聊。',
        },
        {
          role: 'user',
          content: `话题方向：${topic || '（未提供）'}

## 阅读材料
${truncate(body.material.trim(), LIMITS.maxMaterial)}

## 用户刚才的总结
${truncate(body.userContent.trim(), LIMITS.maxUserContent)}

请出 1 到 2 个追问，要求：
1. 指向材料里的一个数字、对比、因果，或用户没提到的关键点；也可以让用户用自己的话解释一个概念；
2. 每题一句话，像当面问出来；
3. 不要问「你还有什么看法」这类空问题。

严格按以下 JSON 格式输出，不要输出任何其他内容：
{ "questions": ["追问1", "追问2"] }`,
        },
      ],
      temperature: 0.6,
      jsonMode: true,
      maxTokens: 400,
    })

    const parsed = parseJsonReply<{ questions?: unknown }>(raw)
    const questions = sanitizeQuestions(parsed.questions)
    if (questions.length === 0) {
      res.json(502, { error: '追问生成失败，可以跳过或重试' })
      return true
    }

    res.json(200, { questions })
  } catch (err) {
    if (err instanceof LlmConfigError) {
      res.json(503, keyRequiredPayload(err.source))
      return true
    }
    if (err instanceof LlmCallError) {
      console.error('[follow-up] LLM call failed:', err.message)
      res.json(502, { error: '追问生成失败，可以跳过或重试' })
      return true
    }
    console.error('[follow-up] unexpected error:', err)
    res.json(500, { error: '服务器内部错误' })
  }
  return true
}
