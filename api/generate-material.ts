/**
 * Vercel Serverless Function：POST /api/generate-material
 * 业务逻辑在 _lib/generate-material.ts，与本地 dev-server 共用。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleGenerateMaterial } from './_lib/generate-material.js'

export const maxDuration = 60

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  await handleGenerateMaterial(
    {
      method: 'POST',
      path: '/api/generate-material',
      body,
      headers: {
        'x-real-ip': req.headers['x-real-ip'] as string | undefined,
        'x-forwarded-for': req.headers['x-forwarded-for'] as string | undefined,
      },
    },
    {
      json: (status, payload) => {
        res.status(status).json(payload)
      },
    },
  )
}
