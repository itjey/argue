interface Env {
  ASSETS: Fetcher
  ALLOWED_ORIGINS?: string
  OPENROUTER_API_KEY?: string
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const DEFAULT_ALLOWED_ORIGINS = [
  'https://itjey.github.io',
  'https://holy-union-290f.jeynarayan2010.workers.dev',
]

function getAllowedOrigins(env: Env) {
  return new Set(
    (env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(','))
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
}

function getCorsHeaders(request: Request, env: Env) {
  const requestOrigin = request.headers.get('Origin')

  if (!requestOrigin) {
    return {}
  }

  if (!getAllowedOrigins(env).has(requestOrigin)) {
    return {}
  }

  return {
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, HTTP-Referer, X-Title',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': requestOrigin,
    Vary: 'Origin',
  }
}

function withCors(response: Response, corsHeaders: Record<string, string>) {
  const headers = new Headers(response.headers)

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value)
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function jsonResponse(
  payload: unknown,
  init: ResponseInit = {},
  corsHeaders: Record<string, string> = {},
) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value)
  }

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  })
}

function buildOpenRouterHeaders(
  request: Request,
  env: Env,
  contentType = 'application/json',
) {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY ?? ''}`,
    'Content-Type': contentType,
    'HTTP-Referer': `${new URL(request.url).origin}/`,
    'X-Title': 'Argue',
  }
}

function ensureOpenRouterKey(env: Env, corsHeaders: Record<string, string>) {
  if (env.OPENROUTER_API_KEY?.trim()) {
    return null
  }

  return jsonResponse(
    {
      error: {
        message:
          'Argue worker is missing OPENROUTER_API_KEY. Add it in Cloudflare and redeploy.',
      },
    },
    { status: 503 },
    corsHeaders,
  )
}

function copyResponseHeaders(source: Headers, corsHeaders: Record<string, string>) {
  const headers = new Headers()
  const contentType = source.get('content-type')
  const cacheControl = source.get('cache-control')

  if (contentType) {
    headers.set('Content-Type', contentType)
  }

  if (cacheControl) {
    headers.set('Cache-Control', cacheControl)
  }

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value)
  }

  return headers
}

async function handleModels(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  corsHeaders: Record<string, string>,
) {
  const missingKeyResponse = ensureOpenRouterKey(env, corsHeaders)

  if (missingKeyResponse) {
    return missingKeyResponse
  }

  const cacheKey = new Request(new URL('/api-cache/models', request.url).toString())
  const cachedResponse = await caches.default.match(cacheKey)

  if (cachedResponse) {
    return withCors(cachedResponse, corsHeaders)
  }

  const upstream = await fetch(`${OPENROUTER_BASE}/models`, {
    headers: buildOpenRouterHeaders(request, env),
  })

  const response = new Response(upstream.body, {
    headers: copyResponseHeaders(upstream.headers, corsHeaders),
    status: upstream.status,
    statusText: upstream.statusText,
  })

  if (upstream.ok) {
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
  }

  return response
}

async function handleChat(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { error: { message: 'Only POST is allowed for chat completions.' } },
      { status: 405 },
      corsHeaders,
    )
  }

  const missingKeyResponse = ensureOpenRouterKey(env, corsHeaders)

  if (missingKeyResponse) {
    return missingKeyResponse
  }

  const upstream = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: buildOpenRouterHeaders(
      request,
      env,
      request.headers.get('content-type') ?? 'application/json',
    ),
    body: request.body,
  })

  return new Response(upstream.body, {
    headers: copyResponseHeaders(upstream.headers, corsHeaders),
    status: upstream.status,
    statusText: upstream.statusText,
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    const corsHeaders = getCorsHeaders(request, env)

    if (url.pathname === '/api/v1/models') {
      return handleModels(request, env, ctx, corsHeaders)
    }

    if (url.pathname === '/api/v1/chat/completions') {
      return handleChat(request, env, corsHeaders)
    }

    if (url.pathname === '/api/health') {
      return jsonResponse(
        {
          ok: true,
          serverManagedOpenRouter: Boolean(env.OPENROUTER_API_KEY?.trim()),
        },
        { status: 200 },
        corsHeaders,
      )
    }

    return env.ASSETS.fetch(request)
  },
}
