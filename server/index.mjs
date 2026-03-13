import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import { extname, join, normalize } from 'node:path'
import { Readable } from 'node:stream'

const PORT = Number(process.env.PORT ?? 3000)
const DIST_DIR = join(process.cwd(), 'dist')
const INDEX_HTML_PATH = join(DIST_DIR, 'index.html')
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim() ?? ''
const DEFAULT_ALLOWED_ORIGINS = ['https://itjey.github.io', 'https://pro.gphmt.org']
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)
const ONE_HOUR_MS = 60 * 60 * 1000

/** @type {{ expiresAt: number, payload: string | null, contentType: string }} */
let modelCatalogCache = {
  expiresAt: 0,
  payload: null,
  contentType: 'application/json; charset=utf-8',
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
} 

function getOriginHeader(request) {
  const proto =
    request.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim() ||
    'https'
  const host =
    request.headers['x-forwarded-host']?.toString().split(',')[0]?.trim() ||
    request.headers.host ||
    'localhost'

  return `${proto}://${host}`
}

function getCorsHeaders(request) {
  const requestOrigin = request.headers.origin?.toString()

  if (!requestOrigin) {
    return {}
  }

  if (!ALLOWED_ORIGINS.has(requestOrigin)) {
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

function writeJson(response, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(body)
}

function ensureOpenRouterKey(response, corsHeaders) {
  if (OPENROUTER_API_KEY) {
    return true
  }

  writeJson(
    response,
    503,
    {
      error: {
        message:
          'Argue server is missing OPENROUTER_API_KEY. Add it to Railway and redeploy.',
      },
    },
    corsHeaders,
  )

  return false
}

function buildOpenRouterHeaders(request, contentType = 'application/json') {
  return {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': contentType,
    'HTTP-Referer': getOriginHeader(request),
    'X-Title': 'Argue',
  }
}

function pickResponseHeaders(sourceHeaders, corsHeaders) {
  const contentType = sourceHeaders.get('content-type')
  const cacheControl = sourceHeaders.get('cache-control')
  const headers = {
    ...corsHeaders,
  }

  if (contentType) {
    headers['Content-Type'] = contentType
  }

  if (cacheControl) {
    headers['Cache-Control'] = cacheControl
  }

  return headers
}

function sanitizeStaticPath(pathname) {
  const normalizedPath = normalize(
    decodeURIComponent(pathname === '/' ? '/index.html' : pathname),
  ).replace(/^(\.\.(\/|\\|$))+/, '')

  return join(DIST_DIR, normalizedPath)
}

async function readRequestBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

async function handleModels(request, response, corsHeaders) {
  if (!ensureOpenRouterKey(response, corsHeaders)) {
    return
  }

  if (modelCatalogCache.payload && Date.now() < modelCatalogCache.expiresAt) {
    response.writeHead(200, {
      'Content-Type': modelCatalogCache.contentType,
      ...corsHeaders,
    })
    response.end(modelCatalogCache.payload)
    return
  }

  const upstream = await fetch(`${OPENROUTER_BASE}/models`, {
    headers: buildOpenRouterHeaders(request),
  })
  const payload = await upstream.text()
  const responseHeaders = pickResponseHeaders(upstream.headers, corsHeaders)

  if (upstream.ok) {
    modelCatalogCache = {
      expiresAt: Date.now() + ONE_HOUR_MS,
      payload,
      contentType:
        upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    }
  }

  response.writeHead(upstream.status, responseHeaders)
  response.end(payload)
}

async function handleChat(request, response, corsHeaders) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders)
    response.end()
    return
  }

  if (request.method !== 'POST') {
    writeJson(
      response,
      405,
      { error: { message: 'Only POST is allowed for chat completions.' } },
      corsHeaders,
    )
    return
  }

  if (!ensureOpenRouterKey(response, corsHeaders)) {
    return
  }

  const body = await readRequestBody(request)
  const contentType =
    request.headers['content-type']?.toString() ?? 'application/json'

  const upstream = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: buildOpenRouterHeaders(request, contentType),
    body,
  })

  response.writeHead(upstream.status, pickResponseHeaders(upstream.headers, corsHeaders))

  if (!upstream.body) {
    response.end(await upstream.text())
    return
  }

  Readable.fromWeb(upstream.body).pipe(response)
}

async function serveStaticAsset(pathname, response) {
  const staticPath = sanitizeStaticPath(pathname)

  if (existsSync(staticPath)) {
    const extension = extname(staticPath).toLowerCase()

    response.writeHead(200, {
      'Content-Type':
        MIME_TYPES[extension] ?? 'application/octet-stream',
    })

    createReadStream(staticPath).pipe(response)
    return
  }

  if (!existsSync(INDEX_HTML_PATH)) {
    writeJson(response, 503, {
      error: {
        message:
          'Static assets are missing. Run `npm run build` before starting the server.',
      },
    })
    return
  }

  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
  })
  response.end(await readFile(INDEX_HTML_PATH))
}

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      writeJson(response, 400, { error: { message: 'Missing request URL.' } })
      return
    }

    const requestUrl = new URL(request.url, getOriginHeader(request))
    const corsHeaders = getCorsHeaders(request)

    if (requestUrl.pathname === '/api/v1/models') {
      await handleModels(request, response, corsHeaders)
      return
    }

    if (requestUrl.pathname === '/api/v1/chat/completions') {
      await handleChat(request, response, corsHeaders)
      return
    }

    if (requestUrl.pathname === '/api/health') {
      writeJson(
        response,
        200,
        {
          ok: true,
          serverManagedOpenRouter: Boolean(OPENROUTER_API_KEY),
        },
        corsHeaders,
      )
      return
    }

    await serveStaticAsset(requestUrl.pathname, response)
  } catch (error) {
    writeJson(response, 500, {
      error: {
        message:
          error instanceof Error ? error.message : 'Unexpected server failure.',
      },
    })
  }
})

server.listen(PORT, () => {
  console.log(`Argue server listening on http://0.0.0.0:${PORT}`)
})
