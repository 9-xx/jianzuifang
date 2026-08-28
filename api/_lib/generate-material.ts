/**
 * POST /api/generate-material —— 整理总结子模式的阅读材料生成。
 *
 * 输入：话题方向（用户从话题库选择或自由输入）。
 * 输出：一段 400-600 字的 AI 生成阅读材料（新知识点/资讯类内容）。
 *
 * 材料由 AI 现场生成而非抓取真实文章：①长度难度可控；②规避版权问题。
 * 材料文本不落库，随响应返回后由前端存入用户本地浏览器。
 */
import { chat, parseJsonReply, LlmConfigError, LlmCallError } from './llm.js'
import { checkRateLimit } from './rate-limit.js'
import { LIMITS, type ApiRequest, type ApiResponseWriter } from './types.js'

interface MaterialRequestBody {
  topic?: unknown
}

const MATERIAL_MIN = 400
const MATERIAL_MAX = 600

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

export async function handleGenerateMaterial(
  req: ApiRequest,
  res: ApiResponseWriter,
): Promise<boolean> {
  if (req.path !== '/api/generate-material') return false

  if (!checkRateLimit(req.headers)) {
    res.json(429, { error: '请求太频繁了，请稍等一分钟再试' })
    return true
  }

  let body: MaterialRequestBody
  try {
    body = JSON.parse(req.body) as MaterialRequestBody
  } catch {
    res.json(400, { error: '请求体不是有效 JSON' })
    return true
  }

  if (!isNonEmptyString(body.topic)) {
    res.json(400, { error: '缺少话题方向' })
    return true
  }
  const topic = body.topic.trim().slice(0, LIMITS.maxTopicLength)

  try {
    const raw = await chat({
      messages: [
        {
          role: 'system',
          content:
            '你是一位知识科普作者，擅长把一个主题写成信息密度适中、结构清晰、适合口头转述练习的短文。你生成的内容必须是原创的，不得复述任何受版权保护的文章。',
        },
        {
          role: 'user',
          content: `请围绕话题「${topic}」写一段 ${MATERIAL_MIN}-${MATERIAL_MAX} 字的中文阅读材料，要求：
1. 是一篇独立成文的小短文（新知识讲解或资讯综述均可），有明确的观点和 3-5 个关键信息点；
2. 信息有一定复杂度，包含数字、对比或因果关系，方便练习"信息压缩 + 提炼 + 转述"；
3. 语言平实，不要用列表和标题，写成连贯的段落（1-3 段）；
4. 只输出正文，不要任何前言、解释或标题。

严格按以下 JSON 格式输出，不要输出任何其他内容：
{ "material": "正文..." }`,
        },
      ],
      temperature: 0.8,
      jsonMode: true,
      maxTokens: 1200,
    })

    const parsed = parseJsonReply<{ material?: unknown }>(raw)
    const material = typeof parsed.material === 'string' ? parsed.material.trim() : ''
    if (material.length < 100) {
      res.json(502, { error: '生成的内容过短，请重新生成' })
      return true
    }

    res.json(200, { material })
  } catch (err) {
    if (err instanceof LlmConfigError) {
      res.json(503, { error: '服务端尚未配置大模型 Key，请联系部署者设置 DEEPSEEK_API_KEY' })
      return true
    }
    if (err instanceof LlmCallError) {
      console.error('[generate-material] LLM call failed:', err.message)
      res.json(502, { error: '内容生成失败，点击重新生成' })
      return true
    }
    console.error('[generate-material] unexpected error:', err)
    res.json(500, { error: '服务器内部错误' })
  }
  return true
}
