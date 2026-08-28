// 阶段1核心逻辑验证脚本（开发辅助，不参与构建）
import { matchLexicon, renderFillerWordsFeedback } from '../src/lib/matcher.js'
import { computeFrequentIssues, classifySessionTags } from '../src/lib/memory.js'
import { computeGrowthSummary } from '../src/lib/growth.js'
import type { PracticeSession, UserDeclaredIssue, TagStatus } from '../src/lib/types.js'

const hits = matchLexicon('然后我觉得可能大概是这样子的，然后就是说，可能吧。')
console.log('词库命中:', hits.map(h => `${h.tag}x${h.count}`).join(', '))
console.log('反馈文案:', renderFillerWordsFeedback(hits))

const declared: UserDeclaredIssue[] = [{ id: 'd1', category: '填充词', inputType: 'lexicon', value: '讲道理', tag: '填充词:讲道理', addedAt: new Date().toISOString() }]
const hits2 = matchLexicon('讲道理，这个事情讲道理来说没问题。', declared)
console.log('含声明词命中:', hits2.map(h => `${h.tag}x${h.count}`).join(', '))

const sessions: PracticeSession[] = []
const mk = (tags: string[], daysAgo: number): PracticeSession => ({ id: 's' + daysAgo + Math.random(), mode: '即兴问答', scenario: '测试', createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(), inputMethod: '打字', userContent: 'x', feedback: {}, feedbackTags: tags.map(t => ({ tag: t, source: 'ai' as const })) })
for (let i = 0; i < 3; i++) sessions.push(mk(['逻辑结构:缺少结论先行'], i))
sessions.push(mk(['填充词:然后'], 10))

const tagStatuses: TagStatus[] = [{ tag: '填充词:然后', status: 'dismissed', updatedAt: new Date().toISOString() }]
const declared2: UserDeclaredIssue[] = [{ id: 'd2', category: '逻辑结构', inputType: 'predefined', value: '缺少结论先行', tag: '逻辑结构:缺少结论先行', addedAt: new Date().toISOString() }]

const views = computeFrequentIssues(sessions, tagStatuses, declared2, 3)
console.log('高频候选:', JSON.stringify(views))

const cls = classifySessionTags(['逻辑结构:缺少结论先行', '填充词:然后'], sessions, tagStatuses, declared2, 3)
console.log('反馈页分类:', JSON.stringify(cls))

const growth = computeGrowthSummary(sessions, [{ tag: '填充词:然后', status: 'confirmed', updatedAt: new Date().toISOString() }], [])
console.log('成长总结:', JSON.stringify(growth, null, 2))
