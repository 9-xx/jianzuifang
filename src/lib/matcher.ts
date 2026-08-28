/**
 * 本地词库匹配模块：对用户作答文本做字符串匹配，检测填充词/口头禅、模糊表达。
 * 不经过大模型，瞬时完成。
 *
 * 匹配范围 = 内置默认词库 + 用户手动声明的 lexicon 类词（UserDeclaredIssue）。
 */
import { DEFAULT_LEXICON, lexiconTag, type LexiconGroup } from '../data/lexicon.js'
import type { LexiconHit, UserDeclaredIssue } from './types.js'

/** 把用户声明的 lexicon 类词合并进词库（按 category 归组去重） */
export function buildEffectiveLexicon(declaredIssues: UserDeclaredIssue[]): LexiconGroup[] {
  const groups: LexiconGroup[] = DEFAULT_LEXICON.map((g) => ({ ...g, words: [...g.words] }))

  for (const issue of declaredIssues) {
    if (issue.inputType !== 'lexicon' || !issue.tag) continue
    // tag 形如 "填充词:讲道理"，词是冒号后面的部分
    const word = issue.tag.includes(':') ? issue.tag.slice(issue.tag.indexOf(':') + 1) : issue.value
    if (!word) continue

    let group = groups.find((g) => g.category === issue.category)
    if (!group) {
      group = {
        category: issue.category === '模糊表达' ? '模糊表达' : '填充词',
        words: [],
        feedbackTemplate: '检测到 {n} 处你声明过的问题词（如"{words}"）。',
      }
      groups.push(group)
    }
    if (!group.words.includes(word)) group.words.push(word)
  }

  return groups
}

/** 对文本执行匹配，返回按词聚合的命中结果（按出现次数降序） */
export function matchLexicon(
  text: string,
  declaredIssues: UserDeclaredIssue[] = [],
): LexiconHit[] {
  const hits = new Map<string, LexiconHit>()

  for (const group of buildEffectiveLexicon(declaredIssues)) {
    for (const word of group.words) {
      if (!word) continue
      // 全局匹配所有出现位置（字符串匹配，不依赖分词）
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matches = text.match(new RegExp(escaped, 'g'))
      const count = matches?.length ?? 0
      if (count === 0) continue

      const tag = lexiconTag(group.category, word)
      const existing = hits.get(tag)
      if (existing) {
        existing.count += count
      } else {
        hits.set(tag, { tag, count, word, category: group.category })
      }
    }
  }

  return [...hits.values()].sort((a, b) => b.count - a.count)
}

/** 把命中结果渲染成填充词维度的反馈文字 */
export function renderFillerWordsFeedback(hits: LexiconHit[]): string | undefined {
  if (hits.length === 0) return undefined

  const byCategory = new Map<string, LexiconHit[]>()
  for (const hit of hits) {
    const list = byCategory.get(hit.category) ?? []
    list.push(hit)
    byCategory.set(hit.category, list)
  }

  const parts: string[] = []
  for (const [category, list] of byCategory) {
    const group = DEFAULT_LEXICON.find((g) => g.category === category)
    const template =
      group?.feedbackTemplate ?? '检测到 {n} 处问题词（如"{words}"）。'
    const total = list.reduce((sum, h) => sum + h.count, 0)
    const topWords = list
      .slice(0, 3)
      .map((h) => h.word)
      .join('、')
    parts.push(template.replace('{n}', String(total)).replace('{words}', topWords))
  }

  return parts.join(' ')
}
