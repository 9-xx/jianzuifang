// 阶段2 API 验证脚本：直接调用 handleFeedback / handleGenerateMaterial（mock LLM）
import { handleFeedback } from '../api/_lib/feedback.js'
import { handleGenerateMaterial } from '../api/_lib/generate-material.js'
import type { ApiRequest, ApiResponseWriter } from '../api/_lib/types.js'

function makeReq(path: string, body: unknown): ApiRequest {
  return { method: 'POST', path, body: JSON.stringify(body), headers: { 'x-forwarded-for': '127.0.0.1' } }
}
function makeRes() {
  return {
    json: (status: number, payload: unknown) => console.log(`  -> ${status}`, JSON.stringify(payload).slice(0, 400)),
  } as ApiResponseWriter
}

// 1. 缺参数
console.log('--- 缺少作答内容 ---')
await handleFeedback(makeReq('/api/feedback', {}), makeRes())

// 2. 整理总结缺材料
console.log('--- 整理总结缺材料 ---')
await handleFeedback(makeReq('/api/feedback', { userContent: 'x', scenario: 's', mode: '结构化表达', subMode: '整理总结' }), makeRes())

// 3. 无 Key（.env 未填真实 key）
console.log('--- 未配置 Key ---')
await handleFeedback(makeReq('/api/feedback', { userContent: '测试内容', scenario: '测试场景', mode: '即兴问答' }), makeRes())

// 4. 限流测试（连续打满 10 次）
console.log('--- 限流 ---')
process.env.DEEPSEEK_API_KEY = 'test-key-for-rate-limit'
const headers = { 'x-forwarded-for': '1.2.3.4' }
let last = 0
for (let i = 0; i < 12; i++) {
  const statuses: number[] = []
  const res: ApiResponseWriter = { json: (s) => { statuses.push(s) } }
  await handleFeedback({ method: 'POST', path: '/api/feedback', body: JSON.stringify({ userContent: 'x', scenario: 's', mode: '即兴问答' }), headers }, res)
  last = statuses[0] ?? 0
}
console.log(`  连续 12 次请求，最后一次状态码: ${last}（期望 429）`)

// 5. generate-material 缺话题
console.log('--- 材料接口缺话题 ---')
await handleGenerateMaterial(makeReq('/api/generate-material', {}), makeRes())

// 6. 错误路径
console.log('--- 未知路径 ---')
const handled = await handleFeedback(makeReq('/api/unknown', {}), makeRes())
console.log('  handled =', handled, '（期望 false）')
