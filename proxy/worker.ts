/**
 * Cloudflare Worker – OpenRouter CORS proxy.
 *
 * Forwards requests to https://openrouter.ai/api/v1/chat/completions
 * while adding the required CORS headers so the browser-based client
 * can call OpenRouter directly with its own API key.
 *
 * Deploy:  cd proxy && npx wrangler deploy
 */

const UPSTREAM = 'https://openrouter.ai/api/v1/chat/completions'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, HTTP-Referer, X-Title',
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
    }

    const upstreamHeaders = new Headers()
    for (const key of ['content-type', 'authorization', 'http-referer', 'x-title']) {
      const value = request.headers.get(key)
      if (value) upstreamHeaders.set(key, value)
    }

    const upstreamResponse = await fetch(UPSTREAM, {
      method: 'POST',
      headers: upstreamHeaders,
      body: request.body,
    })

    const responseHeaders = new Headers(upstreamResponse.headers)
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(k, v)
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    })
  },
}
