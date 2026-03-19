/**
 * Local dev proxy server for OpenRouter.
 * Run: npx tsx proxy/server.ts
 *
 * Listens on http://localhost:8788/api/v1/chat/completions
 * and forwards to OpenRouter with CORS headers.
 */

import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'

const PORT = 8788
const UPSTREAM = 'https://openrouter.ai/api/v1/chat/completions'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, HTTP-Referer, X-Title',
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405, CORS_HEADERS)
    res.end('Method not allowed')
    return
  }

  const upstreamUrl = new URL(UPSTREAM)
  const headers: Record<string, string> = {
    'Content-Type': req.headers['content-type'] ?? 'application/json',
  }
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization
  if (req.headers['http-referer']) headers['HTTP-Referer'] = req.headers['http-referer'] as string
  if (req.headers['x-title']) headers['X-Title'] = req.headers['x-title'] as string

  const proxyReq = https.request(
    {
      hostname: upstreamUrl.hostname,
      port: 443,
      path: upstreamUrl.pathname,
      method: 'POST',
      headers,
    },
    (proxyRes) => {
      const responseHeaders: Record<string, string | string[]> = { ...CORS_HEADERS }
      const ct = proxyRes.headers['content-type']
      if (ct) responseHeaders['Content-Type'] = ct

      res.writeHead(proxyRes.statusCode ?? 502, responseHeaders)
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', (err) => {
    res.writeHead(502, CORS_HEADERS)
    res.end(`Proxy error: ${err.message}`)
  })

  req.pipe(proxyReq)
})

server.listen(PORT, () => {
  console.log(`CORS proxy listening on http://localhost:${PORT}`)
})
