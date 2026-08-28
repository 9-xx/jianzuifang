/**
 * 本地开发用的 API 服务器。
 *
 * 生产环境走 Vercel Serverless Functions（api/feedback.ts、api/generate-material.ts），
 * 本文件只是把同样的处理逻辑包在一个极简 Node HTTP 服务里，供 `npm run dev` 使用，
 * 让 Vite 的 /api 代理有目标可转发（localhost:3001）。
 *
 * 注意：不要在这里写任何业务逻辑，业务逻辑全部在 api/_lib/ 下共享。
 */
import http from 'node:http'
import process from 'node:process'
import { handleFeedback } from './_lib/feedback.js'
import { handleGenerateMaterial } from './_lib/generate-material.js'
import type { ApiRequest } from './_lib/types.js'

const PORT = Number(process.env.PORT ?? 3001)

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? ''
  const path = url.split('?')[0] ?? ''
  const origin = req.headers.origin ?? '*'

  // CORS：本地开发时 Vite 代理同源，这里宽松处理即可
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Method Not Allowed' }))
    return
  }

  const body = await readBody(req)
  const apiReq: ApiRequest = {
    method: 'POST',
    path,
    body,
    headers: { 'x-forwarded-for': req.socket.remoteAddress ?? '' },
  }

  let handled = false
  try {
    if (path === '/api/feedback') {
      handled = await handleFeedback(apiReq, {
        json: (status, payload) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(payload))
        },
      })
    } else if (path === '/api/generate-material') {
      handled = await handleGenerateMaterial(apiReq, {
        json: (status, payload) => {
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(payload))
        },
      })
    }
  } catch (err) {
    console.error('[dev-server] unhandled error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: '服务器内部错误' }))
    return
  }

  if (!handled) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'Not Found' }))
  }
})

server.listen(PORT, () => {
  console.log(`[dev-server] API listening on http://localhost:${PORT}`)
})
