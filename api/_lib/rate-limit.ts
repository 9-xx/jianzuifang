/**
 * 极简内存限流：按 IP 在滑动窗口内计数。
 *
 * Serverless 环境下实例可能不共享内存，限流是"尽力而为"而非精确配额，
 * 但足以拦截单实例上的明显刷量，符合 MVP 阶段"防止大模型调用成本失控"的目标。
 */
import { RATE_LIMIT } from './types.js'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** 定期清理过期桶，避免 Map 无限增长 */
const CLEANUP_INTERVAL_MS = 5 * 60_000
let lastCleanup = Date.now()

function maybeCleanup(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function extractIp(headers: Record<string, string | undefined>): string {
  // Vercel 提供的真实客户端 IP 头，依次回退
  return (
    headers['x-real-ip'] ??
    headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    headers['x-vercel-forwarded-for'] ??
    'unknown'
  )
}

/** 是否允许该 IP 本次请求。允许则返回 true 并计数；超限返回 false。 */
export function checkRateLimit(headers: Record<string, string | undefined>): boolean {
  const ip = extractIp(headers)
  const now = Date.now()
  maybeCleanup(now)

  const bucket = buckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs })
    return true
  }
  if (bucket.count >= RATE_LIMIT.maxRequests) {
    return false
  }
  bucket.count += 1
  return true
}
