/**
 * 材料模拟的场合配置 —— 前后端共用。
 * 面试/客户沟通是一问一答；会议演讲/思辨演讲是先把一段讲完，再被打断或追问。
 */
import type { SimulateSceneType } from '../lib/types.js'

export const SIMULATE_SCENE_TYPES: readonly SimulateSceneType[] = [
  '面试',
  '客户沟通',
  '会议演讲',
  '思辨演讲',
]

export interface SimulateSceneOption {
  id: SimulateSceneType
  hint: string
  briefPlaceholder: string
  materialPlaceholder: string
}

export const SIMULATE_SCENE_OPTIONS: SimulateSceneOption[] = [
  {
    id: '面试',
    hint: '对方是面试官，盯你能不能把判断说出口',
    briefPlaceholder: '例如：讲清我为什么适合这个岗位',
    materialPlaceholder: '粘贴简历、职位描述、作品说明……对方只会根据这里面的内容追问。',
  },
  {
    id: '客户沟通',
    hint: '对方是客户或合作方，盯你有没有落到这份材料',
    briefPlaceholder: '例如：讲清这个方案为什么现在能做',
    materialPlaceholder: '粘贴方案摘要、报价说明、需求纪要……对方只会根据这里面的内容追问。',
  },
  {
    id: '会议演讲',
    hint: '先把这段讲完，会上再被打断或追问',
    briefPlaceholder: '例如：讲清这个季度最该先做哪一件',
    materialPlaceholder: '粘贴会议材料、发言提纲、数据摘要……先讲完，再接住与会者的打断。',
  },
  {
    id: '思辨演讲',
    hint: '对着一篇引发思考的材料，先亮出你的看法再辩',
    briefPlaceholder: '例如：讲清我到底站哪一边',
    materialPlaceholder: '粘贴一篇评论、案例或引发思考的文字……不要复述，用它逼出你自己的判断。',
  },
]

export function isSimulateSceneType(v: unknown): v is SimulateSceneType {
  return typeof v === 'string' && (SIMULATE_SCENE_TYPES as readonly string[]).includes(v)
}

export function simulateRoleLabel(sceneType: SimulateSceneType): string {
  if (sceneType === '面试') return '面试官'
  if (sceneType === '客户沟通') return '客户'
  if (sceneType === '会议演讲') return '与会者'
  return '辩友'
}

/** 先发言再被追问，而不是对方先提问 */
export function isSpeechFirstScene(sceneType: SimulateSceneType): boolean {
  return sceneType === '会议演讲' || sceneType === '思辨演讲'
}

export function simulateSceneOption(sceneType: SimulateSceneType): SimulateSceneOption {
  return SIMULATE_SCENE_OPTIONS.find((s) => s.id === sceneType) ?? SIMULATE_SCENE_OPTIONS[0]!
}

export function simulateDefaultTitle(brief: string, sceneType: SimulateSceneType): string {
  const trimmed = brief.trim()
  if (trimmed) return trimmed.slice(0, 40)
  if (sceneType === '面试') return '材料模拟面试'
  if (sceneType === '客户沟通') return '材料模拟沟通'
  if (sceneType === '会议演讲') return '材料模拟会议发言'
  return '材料模拟思辨演讲'
}

export function simulateFallbackOpening(sceneType: SimulateSceneType): string {
  if (sceneType === '面试') {
    return '我们开始吧。先用你自己的话，讲讲这份材料里最关键的一件事。'
  }
  if (sceneType === '客户沟通') {
    return '先对齐一下。你用自己的话讲讲，这份材料里你最想让我记住什么。'
  }
  if (sceneType === '会议演讲') {
    return '轮到你了。先把这段讲完，我们再问。'
  }
  return '你先讲。这段你到底站哪边，用自己的话说。'
}

export function simulateWarmupCopy(sceneType: SimulateSceneType): { title: string; body: string } {
  if (sceneType === '会议演讲') {
    return {
      title: '先把这段讲完',
      body: '结论先行，再补材料里的依据。讲完会被打断或追问，不必一次说完美。',
    }
  }
  if (sceneType === '思辨演讲') {
    return {
      title: '先亮出你的看法',
      body: '不是复述材料，是用材料逼出你自己的判断。说完会有人来辩。',
    }
  }
  return {
    title: '这场会盯这几块',
    body: '先把判断说出来，再补材料里的依据。对方会追问，不必一次说完。',
  }
}

export function simulateInCharacterCopy(
  sceneType: SimulateSceneType,
  persona: string,
): string {
  const role = simulateRoleLabel(sceneType)
  if (isSpeechFirstScene(sceneType)) {
    return `现在你先讲，对方是${role}（${persona}）。讲完会被打断或追问，这场结束再出戏复盘。`
  }
  return `现在对方是${role}（${persona}）。说完这场再出戏复盘。`
}

export function simulateComposerPlaceholder(
  sceneType: SimulateSceneType,
  userTurns: number,
  voice: boolean,
): string {
  if (voice) return '识别的文字会显示在这里'
  if (isSpeechFirstScene(sceneType) && userTurns === 0) {
    return sceneType === '思辨演讲'
      ? '先把你的看法讲出来，结论先行…'
      : '先把这段讲出来，结论先行…'
  }
  return '对着材料，先把判断说出来…'
}
