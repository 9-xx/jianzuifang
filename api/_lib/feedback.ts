/**
 * POST /api/feedback —— 语义类反馈生成。
 *
 * 输入：用户作答文本、场景信息、练习子模式、用户已声明的问题列表、
 *       （整理总结模式下）AI 生成的阅读材料原文。
 * 输出：分维度反馈文字 + 结构化语义标签数组（白名单校验后）。
 *
 * 无状态：请求处理完即丢弃，不落库。填充词/模糊表达不在此接口处理（前端词库匹配）。
 */
import { chat, parseJsonReply, LlmConfigError, LlmCallError } from './llm.js'
import { ALL_SEMANTIC_TAGS } from '../../src/data/semantic-tags.js'
import { checkRateLimit } from './rate-limit.js'
import { LIMITS, type ApiRequest, type ApiResponseWriter } from './types.js'

interface DeclaredIssueInput {
  category?: unknown
  value?: unknown
  tag?: unknown
}

interface FeedbackRequestBody {
  userContent?: unknown
  scenario?: unknown
  mode?: unknown
  subMode?: unknown
  durationSeconds?: unknown
  material?: unknown
  declaredIssues?: unknown
}

interface FeedbackResult {
  logic: string
  fluency: string
  structure: string
  informationCompleteness?: string
  opinionIndependence?: string
  tags: string[]
  encouragement: string
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

function buildPrompt(body: {
  userContent: string
  scenario: string
  mode: string
  subMode: string | null
  durationSeconds: number | null
  material: string | null
  declaredIssues: Array<{ category: string; value: string; tag?: string }>
}): { system: string; user: string } {
  const isSummary = body.subMode === '整理总结'

  const declaredDesc =
    body.declaredIssues.length > 0
      ? body.declaredIssues
          .map((d) => `- [${d.category}] ${d.value}${d.tag ? `（标签：${d.tag}）` : ''}`)
          .join('\n')
      : '（无）'

  const system = `你是一位温和、专业、鼓励式的中文表达教练，帮用户提升口头表达的逻辑性和流畅度。你的反馈基调永远是建设性的：指出问题时用"这里可以更清楚一点"而不是"你说错了"，最后附一句真诚的鼓励。

你只能从下面这份预定义标签集合中选取问题标签（每个标签必须原样使用，不得改写、不得自创）：
${[...ALL_SEMANTIC_TAGS].join('；')}

注意：填充词、口头禅、模糊表达这类问题由系统词库负责检测，你不需要关注它们，也不要输出与它们相关的标签。`

  const user = `## 本次练习信息
- 练习模式：${body.mode}${body.subMode ? `（${body.subMode}）` : ''}
- 场景：${body.scenario}
${body.durationSeconds != null ? `- 作答用时：约 ${body.durationSeconds} 秒\n` : ''}${
    isSummary && body.material
      ? `\n## 阅读材料（用户读完后总结的原文）\n${truncate(body.material, LIMITS.maxMaterial)}\n`
      : ''
  }
## 用户已声明的问题（请在判断时特别留意这些方面，若确实出现可输出对应标签）
${declaredDesc}

## 用户本次作答内容
${truncate(body.userContent, LIMITS.maxUserContent)}

## 你的任务
请从以下维度给出反馈，并输出结构化标签：
1. logic：逻辑性（观点是否清晰、论证是否有条理）
2. fluency：流畅度（表达是否连贯、有无明显卡壳或绕远）
3. structure：结构完整度（开头-主体-结尾是否完整）${
    isSummary
      ? '\n4. informationCompleteness：信息保留完整度（关键点有没有漏，对照阅读材料判断）\n5. opinionIndependence：个人观点独立性（是单纯复述还是加入了自己的判断）'
      : ''
  }
6. tags：从预定义标签集合中选取本次确实出现的问题标签（0-4 个；没有就给空数组，宁缺毋滥）
7. encouragement：一句简短的鼓励（不超过 40 字）

严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "logic": "...",
  "fluency": "...",
  "structure": "...",
${isSummary ? '  "informationCompleteness": "...",\n  "opinionIndependence": "...",\n' : ''}  "tags": ["标签1", "标签2"],
  "encouragement": "..."
}
每个反馈维度 2-4 句话，具体指出原句中的问题并给出改进示例，不要泛泛而谈。`

  return { system, user }
}

/** 校验并过滤 AI 返回的标签：必须在预定义集合内，去重，最多 6 个 */
function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string' && ALL_SEMANTIC_TAGS.has(item)) {
      seen.add(item)
    }
    if (seen.size >= 6) break
  }
  return [...seen]
}

function sanitizeText(v: unknown, fallback: string): string {
  return isNonEmptyString(v) ? v.trim() : fallback
}

export async function handleFeedback(
  req: ApiRequest,
  res: ApiResponseWriter,
): Promise<boolean> {
  if (req.path !== '/api/feedback') return false

  if (!checkRateLimit(req.headers)) {
    res.json(429, { error: '请求太频繁了，请稍等一分钟再试' })
    return true
  }

  let body: FeedbackRequestBody
  try {
    body = JSON.parse(req.body) as FeedbackRequestBody
  } catch {
    res.json(400, { error: '请求体不是有效 JSON' })
    return true
  }

  if (!isNonEmptyString(body.userContent)) {
    res.json(400, { error: '缺少作答内容' })
    return true
  }
  if (!isNonEmptyString(body.scenario) || !isNonEmptyString(body.mode)) {
    res.json(400, { error: '缺少场景或模式信息' })
    return true
  }

  const subMode = isNonEmptyString(body.subMode) ? body.subMode : null
  const material = isNonEmptyString(body.material) ? body.material : null
  if (subMode === '整理总结' && !material) {
    res.json(400, { error: '整理总结模式缺少阅读材料' })
    return true
  }

  const declaredIssues = Array.isArray(body.declaredIssues)
    ? (body.declaredIssues as DeclaredIssueInput[])
        .slice(0, LIMITS.maxDeclaredIssues)
        .filter(
          (d): d is { category: string; value: string; tag?: string } =>
            isNonEmptyString(d.category) && isNonEmptyString(d.value),
        )
        .map((d) => ({
          category: truncate(d.category, 20),
          value: truncate(d.value, 100),
          ...(isNonEmptyString(d.tag) ? { tag: truncate(d.tag, 60) } : {}),
        }))
    : []

  const prompt = buildPrompt({
    userContent: body.userContent,
    scenario: truncate(body.scenario, 100),
    mode: body.mode,
    subMode,
    durationSeconds:
      typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds)
        ? Math.max(0, Math.round(body.durationSeconds))
        : null,
    material,
    declaredIssues,
  })

  try {
    const raw = await chat({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 1500,
    })

    const parsed = parseJsonReply<Record<string, unknown>>(raw)
    const result: FeedbackResult = {
      logic: sanitizeText(parsed.logic, '本次没有发现明显的逻辑问题。'),
      fluency: sanitizeText(parsed.fluency, '本次表达整体连贯。'),
      structure: sanitizeText(parsed.structure, '结构基本完整。'),
      ...(subMode === '整理总结'
        ? {
            informationCompleteness: sanitizeText(
              parsed.informationCompleteness,
              '未能评估信息保留完整度。',
            ),
            opinionIndependence: sanitizeText(
              parsed.opinionIndependence,
              '未能评估个人观点独立性。',
            ),
          }
        : {}),
      tags: sanitizeTags(parsed.tags),
      encouragement: sanitizeText(parsed.encouragement, '开口练习本身就是进步，继续加油！'),
    }

    res.json(200, result)
  } catch (err) {
    if (err instanceof LlmConfigError) {
      res.json(503, { error: '服务端尚未配置大模型 Key，请联系部署者设置 DEEPSEEK_API_KEY' })
      return true
    }
    if (err instanceof LlmCallError) {
      console.error('[feedback] LLM call failed:', err.message)
      res.json(502, { error: '生成反馈失败，请点击重试' })
      return true
    }
    console.error('[feedback] unexpected error:', err)
    res.json(500, { error: '服务器内部错误' })
  }
  return true
}
