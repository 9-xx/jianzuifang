/**
 * POST /api/feedback —— 语义类反馈生成。
 *
 * 输入：用户作答文本、场景信息、练习子模式、用户已声明的问题列表、
 *       （整理总结模式下）AI 生成的阅读材料原文。
 * 输出：分维度反馈文字 + 结构化语义标签数组（白名单校验后）。
 *
 * 无状态：请求处理完即丢弃，不落库。填充词/模糊表达不在此接口处理（前端词库匹配）。
 */
import { chat, parseJsonReply, requireUserKey, LlmConfigError, LlmCallError, type LlmKeyIssue } from './llm.js'
import { ALL_SEMANTIC_TAGS } from '../../src/data/semantic-tags.js'
import { checkRateLimit } from './rate-limit.js'
import {
  comparedWithLastInstruction,
  formatPreviousAttemptBlock,
  sanitizePreviousAttempt,
  type PreviousAttempt,
} from './previous-attempt.js'
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
  followUpQuestions?: unknown
  followUpAnswers?: unknown
  declaredIssues?: unknown
  previousAttempt?: unknown
}

interface FeedbackResult {
  ideaCompleteness: string
  opinionIndependence: string
  logic: string
  fluency: string
  structure: string
  informationCompleteness?: string
  comparedWithLast?: string
  tags: string[]
  encouragement: string
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

function sanitizeFollowUpQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || item.trim() === '') continue
    out.push(truncate(item.trim(), 120))
    if (out.length >= 2) break
  }
  return out
}

function buildPrompt(body: {
  userContent: string
  scenario: string
  mode: string
  subMode: string | null
  durationSeconds: number | null
  material: string | null
  followUpQuestions: string[]
  followUpAnswers: string | null
  declaredIssues: Array<{ category: string; value: string; tag?: string }>
  previousAttempt: PreviousAttempt | null
}): { system: string; user: string } {
  const isSummary = body.subMode === '整理总结'

  const declaredDesc =
    body.declaredIssues.length > 0
      ? body.declaredIssues
          .map((d) => `- [${d.category}] ${d.value}${d.tag ? `（标签：${d.tag}）` : ''}`)
          .join('\n')
      : '（无）'

  const followUpBlock =
    isSummary && body.followUpQuestions.length > 0
      ? `\n## 总结后的追问（用来检验是真理解还是复述）
${body.followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
## 用户对追问的回答
${body.followUpAnswers ? truncate(body.followUpAnswers, LIMITS.maxFollowUpAnswer) : '（用户跳过了追问，请只根据总结正文判断，不要因此严厉批评）'}\n`
      : ''

  const system = `你是一位温和、专业、鼓励式的中文表达教练。你帮用户把脑子里的想法说完整、说清楚，而不是只评价口才好不好。

优先看两件事：①核心想法有没有真正说出口；②有没有亮出自己的判断。流畅度、结构是次要的。不要评价「思维深不深」，也不要指责用户「只会想不会说」。指出问题时用"这里可以更清楚一点"，并指出哪一句还停在脑子里、可以怎么补上。

整理总结模式下，还要看：总结是不是自己的话，追问时能不能讲清细节。若追问答不上、答得很空或只是重复总结原文，说明可能是在复述而不是理解。

你只能从下面这份预定义标签集合中选取问题标签（每个标签必须原样使用，不得改写、不得自创）：
${[...ALL_SEMANTIC_TAGS].join('；')}

注意：填充词、口头禅、模糊表达这类问题由系统词库负责检测，你不需要关注它们，也不要输出与它们相关的标签。
${body.previousAttempt ? '若提供了上一次练习，必须填写 comparedWithLast，只对照「那一句有没有说出口」，不要比流利或思维深度。' : ''}`

  const compare = comparedWithLastInstruction(Boolean(body.previousAttempt))

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
${followUpBlock}
${body.previousAttempt ? formatPreviousAttemptBlock(body.previousAttempt) : ''}
## 你的任务
请从以下维度给出反馈，并输出结构化标签：
1. ideaCompleteness：想法完整度（核心结论/判断有没有真正说出口，还是停在铺垫、复述、绕弯。具体指出哪一句还停在脑子里，并给一句可直接说出口的补全示例）
2. opinionIndependence：观点独立性（有没有亮出自己的判断，还是在转述常识、材料或讨好式表态）
3. logic：逻辑性（观点是否清晰、论证是否有条理）
4. fluency：流畅度（表达是否连贯、有无明显卡壳或绕远）
5. structure：结构完整度（开头-主体-结尾是否完整）${
    isSummary
      ? '\n6. informationCompleteness：信息保留完整度（关键点有没有漏；若有追问，结合追问回答判断是真理解还是在复述）'
      : ''
  }
7. tags：从预定义标签集合中选取本次确实出现的问题标签（0-4 个；没有就给空数组，宁缺毋滥。优先考虑「核心想法没有说出口」「没有亮出自己的判断」「判断说到一半收回」「追问时答不上细节」这类标签，若确实命中）
8. encouragement：一句简短的鼓励（不超过 40 字），针对这次有没有把想法说出来，不要评价思维深不深
${compare.taskItem ? `9. ${compare.taskItem}\n` : ''}
严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "ideaCompleteness": "...",
  "opinionIndependence": "...",
  "logic": "...",
  "fluency": "...",
  "structure": "...",
${isSummary ? '  "informationCompleteness": "...",\n' : ''}${compare.jsonField}  "tags": ["标签1", "标签2"],
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

/** 503 统一响应：按访客 Key 的问题分流文案，前端据 keyRequired 弹引导 */
function keyRequiredPayload(issue: LlmKeyIssue): { error: string; keyRequired: true } {
  return {
    error:
      issue === 'invalid'
        ? '你填写的 API Key 格式不对：应以 sk- 开头，后面跟一串字母数字。请点右上角「Key」检查后重试'
        : '还没有填写 DeepSeek API Key。点右上角「Key」填入你自己的 Key 后重试（只存本机，本站不会保存）',
    keyRequired: true,
  }
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

  // 纯 BYOK：先验访客 Key，没填/格式不对直接拦下，不进业务逻辑
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

  const previousAttempt = sanitizePreviousAttempt(body.previousAttempt)

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
    followUpQuestions: sanitizeFollowUpQuestions(body.followUpQuestions),
    followUpAnswers: isNonEmptyString(body.followUpAnswers)
      ? truncate(body.followUpAnswers.trim(), LIMITS.maxFollowUpAnswer)
      : null,
    declaredIssues,
    previousAttempt,
  })

  try {
    const raw = await chat({
      userKey,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.4,
      jsonMode: true,
      maxTokens: previousAttempt ? 1700 : 1500,
    })

    const parsed = parseJsonReply<Record<string, unknown>>(raw)
    const result: FeedbackResult = {
      ideaCompleteness: sanitizeText(
        parsed.ideaCompleteness,
        '这次没有清楚听到你的核心想法。下次先把结论说出来，再补理由。',
      ),
      opinionIndependence: sanitizeText(
        parsed.opinionIndependence,
        '这次还不太能分辨哪些是你自己的判断。试着补一句「我的看法是…」。',
      ),
      logic: sanitizeText(parsed.logic, '本次没有发现明显的逻辑问题。'),
      fluency: sanitizeText(parsed.fluency, '本次表达整体连贯。'),
      structure: sanitizeText(parsed.structure, '结构基本完整。'),
      ...(subMode === '整理总结'
        ? {
            informationCompleteness: sanitizeText(
              parsed.informationCompleteness,
              '未能评估信息保留完整度。',
            ),
          }
        : {}),
      tags: sanitizeTags(parsed.tags),
      encouragement: sanitizeText(parsed.encouragement, '开口本身就是在把想法练出来，继续。'),
      ...(previousAttempt && isNonEmptyString(parsed.comparedWithLast)
        ? { comparedWithLast: parsed.comparedWithLast.trim() }
        : {}),
    }

    res.json(200, result)
  } catch (err) {
    if (err instanceof LlmConfigError) {
      res.json(503, keyRequiredPayload(err.source))
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
