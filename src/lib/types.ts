/**
 * 数据模型类型定义 —— 与 docs/有氧健嘴房-数据存储设计.md 一一对应。
 * MVP 阶段所有实体均存在浏览器 localStorage。
 */

/** 练习模式（大模式层级） */
export type PracticeMode = '即兴问答' | '结构化表达' | '材料模拟'

/** 结构化表达的子模式 */
export type SubMode = '自由生成' | '整理总结'

/** 材料模拟的场景类型 */
export type SimulateSceneType = '面试' | '客户沟通' | '会议演讲' | '思辨演讲'

/** 材料模拟的对方人设 */
export type SimulatePersona = '严格挑剔' | '平和追问' | '轻松聊天'

/** 场景分类维度，对应目标用户画像的两个主群体 */
export type ScenarioCategory = '职场向' | '日常表达向'

/** 作答方式：语音和打字平级可选，由用户自由切换 */
export type InputMethod = '语音' | '打字'

/** 标签来源：词库匹配（前端）或 AI 判断（后端） */
export type TagSource = 'lexicon' | 'ai'

/** feedbackTags 数组元素：统一对象结构，方便词库/AI 两类标签统一统计 */
export interface FeedbackTag {
  tag: string
  source: TagSource
}

/** 分维度反馈文字 */
export interface PracticeFeedback {
  /** 想法完整度（AI，主维度）：核心判断有没有说出口 */
  ideaCompleteness?: string
  /** 观点独立性（AI，主维度）：有没有亮出自己的判断 */
  opinionIndependence?: string
  /** 逻辑性（AI） */
  logic?: string
  /** 流畅度（AI） */
  fluency?: string
  /** 填充词/口头禅（词库匹配，辅助） */
  fillerWords?: string
  /** 结构完整度（AI） */
  structure?: string
  /** 仅整理总结：信息保留完整度（AI） */
  informationCompleteness?: string
  /** 仅材料模拟：回答是否落到这份材料上 */
  relevance?: string
  /** 仅材料模拟：答得好的点 */
  highlight?: string
  /** 仅材料模拟：最大风险点 */
  risk?: string
  /** 仅材料模拟：下次开口可以怎么改 */
  nextTip?: string
  /** 再练一次：跟上一次比，上次没说出口的那句这次补上了没有 */
  comparedWithLast?: string
  /** 鼓励性总结 */
  encouragement?: string
}

/** PracticeSession —— 一次练习记录 */
export interface PracticeSession {
  id: string
  mode: PracticeMode
  /** 仅"结构化表达"模式下有值 */
  subMode?: SubMode
  /** 具体场景名称；整理总结模式下为话题方向名称 */
  scenario: string
  /** 场景配置 id，供「再练一次」回到同一题；旧记录可能没有 */
  scenarioId?: string
  /** 即兴问答当场抽到的题目；再练一次带上，才能对照同一题 */
  promptText?: string
  /** 仅整理总结：AI 生成的阅读材料原文，随记录保存供回看对照 */
  aiGeneratedMaterial?: string
  /** 仅整理总结：总结后的追问（1-2 题） */
  followUpQuestions?: string[]
  /** 仅整理总结：用户对追问的回答；跳过则没有 */
  followUpAnswers?: string
  /** ISO 时间 */
  createdAt: string
  inputMethod: InputMethod
  /** 用户本次作答的文字内容（语音先转文字再存） */
  userContent: string
  feedback: PracticeFeedback
  /** 本次触发的结构化问题标签（词库 + AI 合并后一次性写入） */
  feedbackTags: FeedbackTag[]
  /** 作答用时（秒），即兴问答模式下有意义 */
  durationSeconds?: number
  /** 仅材料模拟：当场对话与人设（材料正文默认不落库） */
  simulate?: SimulateSessionMeta
}

export interface SimulateTurn {
  role: 'ai' | 'user'
  text: string
}

export interface SimulateDimension {
  name: string
  why: string
  fromMaterial: string
  questions: string[]
}

export interface SimulateSessionMeta {
  sceneType: SimulateSceneType
  persona: SimulatePersona
  brief: string
  savedMaterialId?: string
  transcript: SimulateTurn[]
  dimensions: Array<{ name: string; why: string }>
}

/** UserSettings —— 本地偏好设置 */
export interface UserSettings {
  /** 上次选择的输入方式，练习页加载时默认选中，隐式跟随使用习惯 */
  preferredInputMethod?: InputMethod
  /** 首页"最近使用"快捷入口，最多 2 条，精确到大模式层级 */
  recentModes?: Array<{ mode: PracticeMode; visitedAt: string }>
  /** 高频问题候选阈值，默认 3 */
  frequentIssueThreshold?: number
}

/** TagStatus —— 系统检测候选的确认/忽略状态 */
export type TagStatusValue = 'pending' | 'confirmed' | 'dismissed'

export interface TagStatus {
  /** 对应 feedbackTags 里的标签值，唯一标识 */
  tag: string
  status: TagStatusValue
  /** ISO 时间 */
  updatedAt: string
}

/** UserDeclaredIssue 的录入方式 */
export type DeclaredInputType =
  /** 词库类（填充词/模糊表达），用户直接输入具体词 */
  | 'lexicon'
  /** 语义类，从标签字典里选 */
  | 'predefined'
  /** 语义类兜底，自由文字描述，不参与合并比对 */
  | 'freeform'

/** UserDeclaredIssue —— 用户手动声明的问题 */
export interface UserDeclaredIssue {
  id: string
  /** 问题大类 */
  category: string
  inputType: DeclaredInputType
  /**
   * 具体内容：lexicon 是用户输入的词；predefined 是选中的字典标签文案；
   * freeform 是用户自由描述的文字
   */
  value: string
  /** 仅 lexicon/predefined 有值：可与 feedbackTags 精确比对的完整标签字符串 */
  tag?: string
  /** ISO 时间 */
  addedAt: string
}

/** 词库匹配命中的单项结果 */
export interface LexiconHit {
  /** 完整标签字符串，如 "填充词:然后" */
  tag: string
  /** 命中次数 */
  count: number
  /** 命中的原词 */
  word: string
  /** 词库分类名 */
  category: string
}

/** /api/feedback 的响应结构 */
export interface AiFeedbackResponse {
  ideaCompleteness: string
  opinionIndependence: string
  logic: string
  fluency: string
  structure: string
  informationCompleteness?: string
  relevance?: string
  highlight?: string
  risk?: string
  nextTip?: string
  comparedWithLast?: string
  /** 语义类标签（已通过白名单校验） */
  tags: string[]
  encouragement: string
}

/** 高频问题候选的展示状态（合并规则计算结果） */
export interface FrequentIssueView {
  tag: string
  /** 系统统计到的累计出现次数 */
  count: number
  /** 展示状态 */
  status: 'pending' | 'confirmed' | 'dismissed' | 'declared-merged'
  /** 是否命中用户手动声明（双来源合并展示） */
  declared: boolean
  /** 用户声明的原始内容（declared 时有值） */
  declaredValue?: string
}
