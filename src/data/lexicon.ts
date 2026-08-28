/**
 * 本地词库 —— 填充词/口头禅、模糊表达的默认词表。
 *
 * 这两类问题靠前端字符串匹配检测，不经过大模型（更便宜、更稳定）。
 * 结构参考"词表 + 分类"的 JSON 格式；用户手动声明的词（lexicon 类型）
 * 会被追加进匹配范围（见 matcher.ts）。
 */

export interface LexiconGroup {
  /** 问题大类（与 UserDeclaredIssue.category 对应） */
  category: '填充词' | '模糊表达'
  /** 该组所有词 */
  words: string[]
  /** 反馈文案模板，{n} 会被替换为命中次数 */
  feedbackTemplate: string
}

export const DEFAULT_LEXICON: LexiconGroup[] = [
  {
    category: '填充词',
    words: [
      '然后',
      '嗯',
      '呃',
      '那个',
      '这个',
      '就是说',
      '对吧',
      '的话',
      '反正',
      '其实吧',
      '怎么说呢',
      '等一下',
      '就是那种',
    ],
    feedbackTemplate:
      '检测到 {n} 处填充词/口头禅（如"{words}"）。它们会稀释表达的信息密度，说之前停顿半秒比说"然后"更自然。',
  },
  {
    category: '模糊表达',
    words: [
      '可能',
      '大概',
      '应该吧',
      '好像',
      '差不多',
      '某种程度上',
      '一般来说',
      '我觉得可能',
      '应该是',
      '之类的吧',
      '什么的',
      '反正就是',
    ],
    feedbackTemplate:
      '检测到 {n} 处模糊表达（如"{words}"）。把"可能大概"换成明确的判断或数字，观点会更有说服力。',
  },
]

/** 词库匹配的完整标签字符串 = `${category}:${word}` */
export function lexiconTag(category: string, word: string): string {
  return `${category}:${word}`
}
