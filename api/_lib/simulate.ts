/**
 * POST /api/simulate —— 自定义材料模拟（面试 / 客户沟通 / 会议演讲 / 思辨演讲）。
 *
 * action:
 * - prepare：从这份材料拆能力域 + 入戏开场白
 * - turn：入戏追问（不给教练评价）
 * - review：出戏复盘（针对性 + 想法有没有说出来）
 *
 * 无状态：请求处理完即丢弃，不落库。
 */
import { chat, parseJsonReply, LlmConfigError, LlmCallError } from './llm.js'
import { ALL_SEMANTIC_TAGS } from '../../src/data/semantic-tags.js'
import {
  isSimulateSceneType,
  isSpeechFirstScene,
  simulateFallbackOpening,
  simulateRoleLabel,
} from '../../src/data/simulate-scenes.js'
import { checkRateLimit } from './rate-limit.js'
import {
  comparedWithLastInstruction,
  formatPreviousAttemptBlock,
  sanitizePreviousAttempt,
} from './previous-attempt.js'
import { LIMITS, type ApiRequest, type ApiResponseWriter } from './types.js'

const PERSONAS = ['严格挑剔', '平和追问', '轻松聊天'] as const

type SceneType = Parameters<typeof simulateRoleLabel>[0]
type Persona = (typeof PERSONAS)[number]

interface SimulateTurn {
  role: 'ai' | 'user'
  text: string
}

interface SimulateDimension {
  name: string
  why: string
  fromMaterial: string
  questions: string[]
}

interface SimulateRequestBody {
  action?: unknown
  sceneType?: unknown
  persona?: unknown
  brief?: unknown
  material?: unknown
  dimensions?: unknown
  transcript?: unknown
  previousAttempt?: unknown
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

function isSceneType(v: unknown): v is SceneType {
  return isSimulateSceneType(v)
}

function isPersona(v: unknown): v is Persona {
  return typeof v === 'string' && (PERSONAS as readonly string[]).includes(v)
}

function roleLabel(sceneType: SceneType): string {
  return simulateRoleLabel(sceneType)
}

function scenePrepareRules(sceneType: SceneType): string {
  if (sceneType === '会议演讲') {
    return `- 这是一场会议发言，不是面试。不要出「你的优缺点」「自我介绍」这类题。
- 能力域盯：结论有没有先说、材料里的关键决策或数据有没有讲到、自己的判断有没有亮出来、被打断时能不能接住。
- 开场白是与会者把话筒交给用户，让用户先把这段讲完。不要先抛问题。`
  }
  if (sceneType === '思辨演讲') {
    return `- 这是一场思辨演讲。材料用来逼出用户自己的判断，不是让他复述。
- 能力域盯：立场有没有亮出来、论据有没有落到这篇材料、对立观点有没有接住、会不会只抒情不判断。
- 开场白是辩友请用户先讲完整一段。不要先问「你怎么看第一段」。用户还没开口，禁止使用「刚才」「你刚说」。`
  }
  return `- 能力域必须来自这份材料，不要出通用面试题（例如「你的优缺点」「为什么应聘我们」这类，除非材料里明确出现）。
- 问题要具体，能逼对方把判断说出口，而不是背简历。
- 开场白是对方的第一句话：用户还没开口，不要说「你刚才提到」。直接进入正题。`
}

function sceneTurnHint(sceneType: SceneType, userTurns: number, mustWrap: boolean): string {
  if (mustWrap) {
    return '用户已经说了足够多轮。请用一句入戏的收场白结束（可以点出你还没听清楚的一点，但不要开始复盘），并令 forceEnd 为 true。'
  }
  if (isSpeechFirstScene(sceneType) && userTurns === 1) {
    if (sceneType === '思辨演讲') {
      return '用户刚讲完第一段。如果他在复述材料而没有亮出立场，立刻逼他表态；如果已经表态，就抓一个材料里的对立点来辩。一次一句。'
    }
    return '用户刚讲完第一段发言。针对他刚说的、或材料里他没讲到的一点，入戏追问或打断。一次一句。'
  }
  if (sceneType === '思辨演讲') {
    return '继续辩。对方如果在复述或空转，逼他落到这篇材料上的一个具体判断。不要帮他总结材料。'
  }
  if (sceneType === '会议演讲') {
    return '继续以与会者身份打断或追问。抓住没讲清的决策、数据或判断。不要变成面试官。'
  }
  return '请继续追问。若对方已经把核心判断说清楚、再问只会空转，也可以收场并令 forceEnd 为 true。'
}

function sceneReviewHint(sceneType: SceneType): string {
  if (sceneType === '思辨演讲') {
    return '这场是思辨演讲。复述材料不算把想法说出来；要看立场有没有亮出来、有没有落到这篇引发思考的材料上。'
  }
  if (sceneType === '会议演讲') {
    return '这场是会议发言。要看结论有没有先说出口、材料里的关键点有没有讲到、被打断后有没有接住。'
  }
  return ''
}

function personaRule(persona: Persona): string {
  if (persona === '严格挑剔') {
    return '语气冷、短、不客气。抓住空话、和材料对不上的地方立刻追问。不鼓励、不总结、不教学。'
  }
  if (persona === '平和追问') {
    return '语气平稳。顺着对方刚说的话往下问一个具体细节。不评价答得好不好。'
  }
  return '像同事当面聊，口语、短句。但仍把话题拉回这份材料，不要变成无关寒暄。'
}

function sanitizeQuestions(raw: unknown, maxCount: number, maxLen: number): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const q = item.replace(/\s+/g, ' ').trim()
    if (q.length < 4) continue
    out.push(truncate(q, maxLen))
    if (out.length >= maxCount) break
  }
  return out
}

function sanitizeDimensions(raw: unknown): SimulateDimension[] {
  if (!Array.isArray(raw)) return []
  const out: SimulateDimension[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (!isNonEmptyString(rec.name)) continue
    const questions = sanitizeQuestions(rec.questions, 2, 80)
    out.push({
      name: truncate(rec.name.trim(), 20),
      why: isNonEmptyString(rec.why) ? truncate(rec.why.trim(), 80) : '',
      fromMaterial: isNonEmptyString(rec.fromMaterial)
        ? truncate(rec.fromMaterial.trim(), 80)
        : '',
      questions,
    })
    if (out.length >= 4) break
  }
  return out.slice(0, 4)
}

function sanitizeTranscript(raw: unknown): SimulateTurn[] {
  if (!Array.isArray(raw)) return []
  const out: SimulateTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (rec.role !== 'ai' && rec.role !== 'user') continue
    if (!isNonEmptyString(rec.text)) continue
    out.push({
      role: rec.role,
      text: truncate(rec.text.trim(), LIMITS.maxUserContent),
    })
    if (out.length >= 16) break
  }
  return out
}

function countUserTurns(transcript: SimulateTurn[]): number {
  return transcript.filter((t) => t.role === 'user').length
}

function formatTranscript(transcript: SimulateTurn[]): string {
  return transcript
    .map((t) => `${t.role === 'ai' ? '对方' : '用户'}：${t.text}`)
    .join('\n\n')
}

function formatDimensions(dims: SimulateDimension[]): string {
  if (dims.length === 0) return '（尚未拆出能力域，请紧扣材料追问）'
  return dims
    .map((d, i) => {
      const qs = d.questions.length > 0 ? d.questions.map((q) => `    - ${q}`).join('\n') : '    - （无预设问题，请按材料追问）'
      return `${i + 1}. ${d.name}
   为什么问：${d.why || '（未说明）'}
   材料依据：${d.fromMaterial || '（未摘录）'}
   可追问：
${qs}`
    })
    .join('\n')
}

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

function llmFail(res: ApiResponseWriter, err: unknown): void {
  if (err instanceof LlmConfigError) {
    res.json(503, { error: '服务端尚未配置大模型 Key，请联系部署者设置 DEEPSEEK_API_KEY' })
    return
  }
  if (err instanceof LlmCallError) {
    console.error('[simulate] LLM call failed:', err.message)
    res.json(502, { error: '生成失败，请点击重试' })
    return
  }
  console.error('[simulate] unexpected error:', err)
  res.json(500, { error: '服务器内部错误' })
}

async function handlePrepare(
  res: ApiResponseWriter,
  input: { sceneType: SceneType; persona: Persona; brief: string; material: string },
): Promise<void> {
  const role = roleLabel(input.sceneType)
  try {
    const raw = await chat({
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 1200,
      messages: [
        {
          role: 'system',
          content: `你在帮用户准备一场针对「这份材料」的模拟${input.sceneType}。先从材料里拆出对方会盯的能力域，再写一句入戏开场白。

硬性要求：
- 每个能力域都要写清：材料里哪一点让你盯这个。
- 不要评价用户的思维深不深，也不要给教练建议。
- 开场白必须是${role}的口吻，符合人设：${personaRule(input.persona)}
${scenePrepareRules(input.sceneType)}`,
        },
        {
          role: 'user',
          content: `场景：${input.sceneType}
人设：${input.persona}
用户想练的点：${input.brief || '（未填写，请按材料判断这场最该问什么）'}

## 材料
${truncate(input.material, LIMITS.maxMaterial)}

请输出 JSON（不要输出其他内容）：
{
  "dimensions": [
    {
      "name": "不超过10个字的能力域名",
      "why": "为什么这场要盯这块（不超过40字）",
      "fromMaterial": "材料里的依据，可短摘（不超过40字）",
      "questions": ["可能的追问1", "可能的追问2"]
    }
  ],
  "opening": "${role}的第一句话，口语、短。${
            isSpeechFirstScene(input.sceneType) ? '把话筒交给用户，让他先讲完。' : '直接进入正题，用户还没开口。'
          }"
}
dimensions 必须 3 到 4 个；每个 questions 1 到 2 句。`,
        },
      ],
    })

    const parsed = parseJsonReply<Record<string, unknown>>(raw)
    const dimensions = sanitizeDimensions(parsed.dimensions)
    if (dimensions.length < 2) {
      res.json(502, { error: '这场题拆得不够清楚，请稍后重试' })
      return
    }
    const opening = sanitizeText(parsed.opening, simulateFallbackOpening(input.sceneType))

    res.json(200, { dimensions, opening: truncate(opening, 200) })
  } catch (err) {
    llmFail(res, err)
  }
}

async function handleTurn(
  res: ApiResponseWriter,
  input: {
    sceneType: SceneType
    persona: Persona
    brief: string
    material: string
    dimensions: SimulateDimension[]
    transcript: SimulateTurn[]
  },
): Promise<void> {
  const userTurns = countUserTurns(input.transcript)
  if (userTurns < 1) {
    res.json(400, { error: '还没有你的回答' })
    return
  }
  if (userTurns > LIMITS.maxSimulateUserTurns) {
    res.json(400, { error: '这场已经结束了' })
    return
  }

  const mustWrap = userTurns >= LIMITS.maxSimulateUserTurns
  const recent = input.transcript.slice(-8)
  const role = roleLabel(input.sceneType)

  try {
    const raw = await chat({
      temperature: 0.7,
      jsonMode: true,
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content: `你是${role}，正在和对方当面沟通。人设：${personaRule(input.persona)}

硬性要求：
- 始终入戏。不要说自己是 AI、教练或在做模拟。
- 一次只说一句，短、口语、针对对方刚说的话或材料里的具体点。
- 如果对方说得很空、只谈共性、没落到这份材料，立刻把问题拉回材料。
- 不要给反馈、不要总结表现、不要教对方怎么说。
- 不要一次抛一串问题。
${input.sceneType === '会议演讲' ? '- 你是与会者，不是面试官。可以打断，但不要变成盘问简历。' : ''}
${input.sceneType === '思辨演讲' ? '- 你是辩友。逼对方亮出判断，不要帮他概括材料。' : ''}`,
        },
        {
          role: 'user',
          content: `用户想练的点：${input.brief || '（未填写）'}

## 材料
${truncate(input.material, LIMITS.maxMaterial)}

## 这场要盯的能力域（可参考，不要照本宣科念出来）
${formatDimensions(input.dimensions)}

## 到目前为止的对话
${formatTranscript(recent)}

${sceneTurnHint(input.sceneType, userTurns, mustWrap)}

输出 JSON：
{ "reply": "你的下一句（不超过80字）", "forceEnd": false }`,
        },
      ],
    })

    const parsed = parseJsonReply<Record<string, unknown>>(raw)
    const reply = truncate(
      sanitizeText(parsed.reply, '这个再说具体一点。结合刚才那份材料，你自己怎么看？'),
      200,
    )
    const forceEnd = mustWrap || parsed.forceEnd === true
    res.json(200, { reply, forceEnd })
  } catch (err) {
    llmFail(res, err)
  }
}

async function handleReview(
  res: ApiResponseWriter,
  input: {
    sceneType: SceneType
    persona: Persona
    brief: string
    material: string
    dimensions: SimulateDimension[]
    transcript: SimulateTurn[]
    previousAttempt: ReturnType<typeof sanitizePreviousAttempt>
  },
): Promise<void> {
  if (countUserTurns(input.transcript) < 1) {
    res.json(400, { error: '这场还没有你的回答，没法复盘' })
    return
  }

  const compare = comparedWithLastInstruction(Boolean(input.previousAttempt))

  try {
    const raw = await chat({
      temperature: 0.4,
      jsonMode: true,
      maxTokens: input.previousAttempt ? 1800 : 1600,
      messages: [
        {
          role: 'system',
          content: `你是一位温和的中文表达教练。模拟已经结束，现在出戏复盘。

你帮用户看：对着这份材料，想法有没有说出口、判断有没有亮出来、回答有没有落到材料上。不要评价「思维深不深」，不要指责「只会想不会说」。
${sceneReviewHint(input.sceneType)}
${input.previousAttempt ? '若提供了上一次练习，必须填写 comparedWithLast，只对照「那一句有没有说出口」，不要比流利或思维深度。' : ''}

你只能从下面这份预定义标签集合中选取问题标签（必须原样使用，不得改写、不得自创）：
${[...ALL_SEMANTIC_TAGS].join('；')}

填充词、口头禅、模糊表达由系统词库负责，你不要输出这类标签。`,
        },
        {
          role: 'user',
          content: `场景：${input.sceneType}（对方人设：${input.persona}）
用户想练的点：${input.brief || '（未填写）'}

## 材料
${truncate(input.material, LIMITS.maxMaterial)}

## 这场盯过的能力域
${formatDimensions(input.dimensions)}

## 完整对话
${formatTranscript(input.transcript)}

${input.previousAttempt ? formatPreviousAttemptBlock(input.previousAttempt) : ''}
请从以下维度给出反馈：
1. ideaCompleteness：核心结论/判断有没有真正说出口
2. opinionIndependence：有没有亮出自己的判断，还是在复述材料或讨好
3. relevance：回答有没有落到这份材料上（指出哪一句在说共性、哪一句才贴材料）
4. highlight：这场答得好的一点（具体到原句）
5. risk：最大风险点（对方最可能继续追的那处空）
6. nextTip：下次开口可以先说的那一句（可直接说出口的示例）
7. logic / fluency / structure：各 2 句话，辅助，不要压过上面几项
8. tags：0-4 个；优先「针对性:回答脱离材料」「针对性:只谈共性没有落到这份材料」「针对性:被追问细节时改口」「逻辑结构:核心想法没有说出口」「逻辑结构:没有亮出自己的判断」；没出现就空数组
9. encouragement：不超过 40 字，针对这场有没有把想法说出来
${compare.taskItem ? `10. ${compare.taskItem}` : ''}

严格输出 JSON：
{
  "ideaCompleteness": "...",
  "opinionIndependence": "...",
  "relevance": "...",
  "highlight": "...",
  "risk": "...",
  "nextTip": "...",
  "logic": "...",
  "fluency": "...",
  "structure": "...",
${compare.jsonField}  "tags": [],
  "encouragement": "..."
}`,
        },
      ],
    })

    const parsed = parseJsonReply<Record<string, unknown>>(raw)
    res.json(200, {
      ideaCompleteness: sanitizeText(
        parsed.ideaCompleteness,
        '这场没有清楚听到你的核心判断。下次先对着材料说一句结论。',
      ),
      opinionIndependence: sanitizeText(
        parsed.opinionIndependence,
        '还不太能分辨哪些是你自己的判断。试着补一句「我的看法是…」。',
      ),
      relevance: sanitizeText(
        parsed.relevance,
        '有几句还停在通用表态，没有落到这份材料上。',
      ),
      highlight: sanitizeText(parsed.highlight, '开口本身已经把这场接住了。'),
      risk: sanitizeText(parsed.risk, '被追问细节时，容易从材料滑向空话。'),
      nextTip: sanitizeText(
        parsed.nextTip,
        '下次先说：「结合这份材料，我的判断是…」，再补一个具体点。',
      ),
      logic: sanitizeText(parsed.logic, '这次没有发现明显的逻辑问题。'),
      fluency: sanitizeText(parsed.fluency, '本次表达整体连贯。'),
      structure: sanitizeText(parsed.structure, '结构基本完整。'),
      tags: sanitizeTags(parsed.tags),
      encouragement: sanitizeText(parsed.encouragement, '开口本身就是在把想法练出来，继续。'),
      ...(input.previousAttempt && isNonEmptyString(parsed.comparedWithLast)
        ? { comparedWithLast: parsed.comparedWithLast.trim() }
        : {}),
    })
  } catch (err) {
    llmFail(res, err)
  }
}

export async function handleSimulate(
  req: ApiRequest,
  res: ApiResponseWriter,
): Promise<boolean> {
  if (req.path !== '/api/simulate') return false

  if (!checkRateLimit(req.headers)) {
    res.json(429, { error: '请求太频繁了，请稍等一分钟再试' })
    return true
  }

  let body: SimulateRequestBody
  try {
    body = JSON.parse(req.body) as SimulateRequestBody
  } catch {
    res.json(400, { error: '请求体不是有效 JSON' })
    return true
  }

  const action = body.action
  if (action !== 'prepare' && action !== 'turn' && action !== 'review') {
    res.json(400, { error: '缺少有效的 action' })
    return true
  }
  if (!isSceneType(body.sceneType) || !isPersona(body.persona)) {
    res.json(400, { error: '请选择场景类型和对方人设' })
    return true
  }
  if (!isNonEmptyString(body.material)) {
    res.json(400, { error: '请粘贴这次要练的材料' })
    return true
  }

  const input = {
    sceneType: body.sceneType,
    persona: body.persona,
    brief: isNonEmptyString(body.brief) ? truncate(body.brief.trim(), LIMITS.maxBrief) : '',
    material: truncate(body.material.trim(), LIMITS.maxMaterial),
    dimensions: sanitizeDimensions(body.dimensions),
    transcript: sanitizeTranscript(body.transcript),
    previousAttempt: sanitizePreviousAttempt(body.previousAttempt),
  }

  if (action === 'prepare') {
    await handlePrepare(res, input)
    return true
  }
  if (action === 'turn') {
    await handleTurn(res, input)
    return true
  }
  await handleReview(res, input)
  return true
}
