/**
 * 预设场景/话题库 —— 静态配置，随前端代码打包发布。
 *
 * 结构（见技术架构文档）：
 * - 即兴问答模式：场景 + 问题池（每次练习随机抽一道，避开最近抽过的）
 * - 结构化表达-自由生成：话题库
 * - 结构化表达-整理总结：话题方向（材料由 AI 现场生成）
 *
 * 分类维度：职场向 / 日常表达向，对应目标用户画像的两个主群体。
 */

export type ScenarioCategory = '职场向' | '日常表达向'

export interface ImpromptuScenario {
  id: string
  mode: '即兴问答'
  category: ScenarioCategory
  name: string
  description: string
  /** 限时秒数（默认 120） */
  timeLimitSeconds: number
  /** 问题池：每次练习随机抽一道 */
  questions: string[]
}

export interface FreeGenTopic {
  id: string
  mode: '结构化表达'
  subMode: '自由生成'
  category: ScenarioCategory
  name: string
  description: string
  /** 引导用户用"结论先行 + 三个理由"等简单框架组织思路 */
  frameworkHint: string
}

export interface SummaryTopic {
  id: string
  mode: '结构化表达'
  subMode: '整理总结'
  category: ScenarioCategory
  name: string
  description: string
  /** 传给后端生成材料的话题方向 */
  topic: string
}

export type Scenario = ImpromptuScenario | FreeGenTopic | SummaryTopic

// ================= 即兴问答 · 职场向 =================

const impromptuWork: ImpromptuScenario[] = [
  {
    id: 'imp-work-report-followup',
    mode: '即兴问答',
    category: '职场向',
    name: '汇报时被临时提问',
    description: '你正在汇报工作进展，领导突然打断追问细节。练"被打断后稳住、有逻辑地接住问题"。',
    timeLimitSeconds: 120,
    questions: [
      '这个方案的成本大概是多少？依据是什么？',
      '如果这个方向走不通，你的备选方案是什么？',
      '这个进度比原计划慢了，原因是什么？',
      '你觉得这个结果里最大的风险点在哪？',
      '如果只能保留这个项目里的一件事，你会保留哪个？为什么？',
      '你的团队其他人是怎么看这个方案的？',
    ],
  },
  {
    id: 'imp-work-interview-pressure',
    mode: '即兴问答',
    category: '职场向',
    name: '面试压力题',
    description: '模拟面试官的连环追问和压力题，练"压力下依然组织出有结构的回答"。',
    timeLimitSeconds: 120,
    questions: [
      '说说你职业生涯里最大的一个失误，你是怎么处理的？',
      '你觉得自己哪方面的能力是被高估的？',
      '如果我们给你的绩效评价是"不达标"，你会怎么想？',
      '你为什么离开上一家公司？说实话。',
      '给你一个完全陌生的任务，你前 48 小时会做什么？',
      '你和上级意见冲突时，一般怎么处理？举个具体例子。',
    ],
  },
  {
    id: 'imp-work-meeting-speakup',
    mode: '即兴问答',
    category: '职场向',
    name: '会议上被点名发言',
    description: '开会时突然被点名"你怎么看"，练"短时间内给出有观点、有理由的发言"。',
    timeLimitSeconds: 90,
    questions: [
      '刚才讨论的这个方案，你怎么看？',
      '如果预算砍掉一半，你会先砍哪部分？',
      '你觉得我们团队现在最需要改进的一件事是什么？',
      '这个季度你最有成就感的一件事是什么？',
      '如果让你来主持下一个项目，你会先做什么？',
    ],
  },
  {
    id: 'imp-work-cross-team',
    mode: '即兴问答',
    category: '职场向',
    name: '跨部门沟通被质疑',
    description: '其他部门不配合、质疑你的需求，练"面对质疑时讲清理由、不慌不恼"。',
    timeLimitSeconds: 120,
    questions: [
      '这个需求为什么必须这周就要？',
      '你们自己内部没对齐，为什么要我们来兜底？',
      '这个改动会影响我们的排期，你打算怎么补偿？',
      '你怎么保证这次不会再反复改需求？',
    ],
  },
]

// ================= 即兴问答 · 日常表达向 =================

const impromptuDaily: ImpromptuScenario[] = [
  {
    id: 'imp-daily-smalltalk',
    mode: '即兴问答',
    category: '日常表达向',
    name: '社交场合被突然搭话',
    description: '聚会、饭局上被突然问到私人话题，练"自然接话、不冷场不尴尬"。',
    timeLimitSeconds: 90,
    questions: [
      '最近在忙什么呢？',
      '你是做什么工作的？平时都干点啥？',
      '你觉得这座城市生活怎么样？',
      '最近有没有看什么好看的剧或书？',
      '周末一般都怎么过？',
    ],
  },
  {
    id: 'imp-daily-explain',
    mode: '即兴问答',
    category: '日常表达向',
    name: '给家人朋友解释一件事',
    description: '把一件专业或复杂的事讲给完全不懂的人听，练"用大白话讲清楚"。',
    timeLimitSeconds: 120,
    questions: [
      '请解释一下你的工作是干什么的，假设对方完全不懂这个行业。',
      '解释一下为什么最近东西都变贵了。',
      '解释一下人工智能是怎么"思考"的。',
      '解释一下为什么运动能让人心情变好。',
      '解释一下你最近学到的一个新东西。',
    ],
  },
  {
    id: 'imp-daily-interrupted',
    mode: '即兴问答',
    category: '日常表达向',
    name: '说话被打断后接回来',
    description: '话说一半被人打断、抢白，练"稳住思路、把话接回来"。',
    timeLimitSeconds: 90,
    questions: [
      '（想象你正说到一半被人打断："等等，你先回答我这个——"）你刚才想说的观点是什么？请先接住打断，再把话说完。',
      '（想象有人质疑你："你这说法不对吧？"）请先回应质疑，再继续表达你的观点。',
      '（想象有人插话："说重点。"）请用三句话把你想说的重点讲完。',
    ],
  },
  {
    id: 'imp-daily-opinion',
    mode: '即兴问答',
    category: '日常表达向',
    name: '被问"你怎么看"',
    description: '朋友随口问起对某件事的看法，练"快速形成观点并给出理由"。',
    timeLimitSeconds: 90,
    questions: [
      '你怎么看"躺平"这个现象？',
      '你觉得远程办公和坐班，哪个更好？',
      '现在很多人用 AI 写东西，你怎么看？',
      '你觉得存钱重要还是及时行乐重要？',
      '你怎么看现在流行的"极简生活"？',
    ],
  },
]

// ================= 结构化表达 · 自由生成 =================

const freeGenTopics: FreeGenTopic[] = [
  {
    id: 'fg-work-project-summary',
    mode: '结构化表达',
    subMode: '自由生成',
    category: '职场向',
    name: '项目进展汇报',
    description: '把手头一个项目的进展整理成一段清晰的口头汇报。',
    frameworkHint: '建议框架：结论先行（项目整体状态一句话）→ 三个要点（进展 / 风险 / 下一步）→ 收尾（需要什么支持）',
  },
  {
    id: 'fg-work-proposal',
    mode: '结构化表达',
    subMode: '自由生成',
    category: '职场向',
    name: '说服他人接受你的方案',
    description: '你有一个想推动的想法，把它组织成一段有说服力的表达。',
    frameworkHint: '建议框架：先说结论（我建议做什么）→ 三个理由（为什么值得做）→ 回应顾虑（可能的反对意见）→ 行动请求',
  },
  {
    id: 'fg-work-retrospective',
    mode: '结构化表达',
    subMode: '自由生成',
    category: '职场向',
    name: '复盘一次失误',
    description: '把一次工作失误整理成一段复盘表达，练"坦诚 + 有条理"。',
    frameworkHint: '建议框架：结论（发生了什么、影响是什么）→ 原因分析（三个层面）→ 改进措施（具体可执行）',
  },
  {
    id: 'fg-daily-story',
    mode: '结构化表达',
    subMode: '自由生成',
    category: '日常表达向',
    name: '讲一段自己的经历',
    description: '把最近一段经历讲成有起承转合的故事，练"叙事结构"。',
    frameworkHint: '建议框架：背景（什么时候、什么事）→ 经过（关键转折）→ 结果与感受（一句话收束）',
  },
  {
    id: 'fg-daily-recommend',
    mode: '结构化表达',
    subMode: '自由生成',
    category: '日常表达向',
    name: '推荐一样你喜欢的东西',
    description: '向别人推荐一部剧、一家店或一个爱好，练"有理有据地安利"。',
    frameworkHint: '建议框架：结论（我推荐什么）→ 三个理由（好在哪）→ 适合谁（什么人适合）',
  },
  {
    id: 'fg-daily-viewpoint',
    mode: '结构化表达',
    subMode: '自由生成',
    category: '日常表达向',
    name: '表达一个有争议的观点',
    description: '选一个你有想法的话题，把观点组织成一段立得住的表达。',
    frameworkHint: '建议框架：结论（我的观点）→ 三个理由（论据）→ 让步（对方可能对的地方）→ 重申结论',
  },
]

// ================= 结构化表达 · 整理总结 =================

const summaryTopics: SummaryTopic[] = [
  {
    id: 'st-work-industry',
    mode: '结构化表达',
    subMode: '整理总结',
    category: '职场向',
    name: '行业趋势速览',
    description: '读一段行业动态综述，总结关键点并给出你的判断——像读完报告向领导汇报那样。',
    topic: '当前一个热门行业的发展趋势与争议',
  },
  {
    id: 'st-work-method',
    mode: '结构化表达',
    subMode: '整理总结',
    category: '职场向',
    name: '工作方法论',
    description: '读一段讲工作方法的内容，提炼要点并转述——像读书会分享那样。',
    topic: '一种提升个人工作效率的实用方法',
  },
  {
    id: 'st-daily-science',
    mode: '结构化表达',
    subMode: '整理总结',
    category: '日常表达向',
    name: '生活科普',
    description: '读一段生活科普短文，总结核心信息并说说你的看法。',
    topic: '一个与日常生活相关的科学知识',
  },
  {
    id: 'st-daily-social',
    mode: '结构化表达',
    subMode: '整理总结',
    category: '日常表达向',
    name: '社会现象观察',
    description: '读一段社会现象分析，提炼观点并加入你自己的判断。',
    topic: '一个值得思考的当代社会现象',
  },
]

export const IMPROMPTU_SCENARIOS: ImpromptuScenario[] = [...impromptuWork, ...impromptuDaily]
export const FREEGEN_TOPICS: FreeGenTopic[] = freeGenTopics
export const SUMMARY_TOPICS: SummaryTopic[] = summaryTopics

export const ALL_SCENARIOS: Scenario[] = [...IMPROMPTU_SCENARIOS, ...FREEGEN_TOPICS, ...SUMMARY_TOPICS]

export function findScenario(id: string): Scenario | undefined {
  return ALL_SCENARIOS.find((s) => s.id === id)
}

/**
 * 从问题池随机抽一道题，避开最近抽过的（记录在 sessionStorage，
 * 会话内有效——同一次浏览里连续练同一场景不重复）。
 */
export function pickQuestion(scenario: ImpromptuScenario): string {
  const recentKey = `expression-gym:recent-questions:${scenario.id}`
  let recent: string[] = []
  try {
    recent = JSON.parse(sessionStorage.getItem(recentKey) ?? '[]') as string[]
  } catch {
    recent = []
  }

  const pool = scenario.questions.filter((q) => !recent.includes(q))
  const candidates = pool.length > 0 ? pool : scenario.questions
  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  const question = picked ?? scenario.questions[0] ?? ''

  const nextRecent = [...recent.filter((q) => q !== question), question]
  try {
    sessionStorage.setItem(
      recentKey,
      JSON.stringify(nextRecent.slice(-Math.max(1, scenario.questions.length - 1))),
    )
  } catch {
    /* ignore */
  }
  return question
}
