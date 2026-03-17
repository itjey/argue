import assert from 'node:assert/strict'

const pagesUrl = process.env.ARGUE_PAGES_URL ?? 'https://itjey.github.io/argue/'
const workerUrl =
  process.env.ARGUE_CLOUDFLARE_URL ?? 'https://holy-union-290f.jeynarayan2010.workers.dev/'

async function fetchText(url: string) {
  const response = await fetch(url)
  assert.equal(response.ok, true, `Expected ${url} to respond successfully.`)
  return response.text()
}

async function fetchJson(url: string) {
  const response = await fetch(url)
  assert.equal(response.ok, true, `Expected ${url} to respond successfully.`)
  return response.json()
}

const [pagesHtml, workerHtml, workerHealth, pagesStatsResponse] = await Promise.all([
  fetchText(pagesUrl),
  fetchText(workerUrl),
  fetchJson(new URL('api/health', workerUrl).toString()) as Promise<{
    ok?: boolean
    serverManagedOpenRouter?: boolean
  }>,
  fetch(new URL('openrouter-stats.json', pagesUrl)),
])

assert.match(pagesHtml, /\/argue\/assets\//)
assert.match(workerHtml, /<div id="root"><\/div>/)
assert.match(workerHtml, /\/assets\//)
assert.equal(workerHealth.ok, true)
assert.equal(typeof workerHealth.serverManagedOpenRouter, 'boolean')
assert.equal(pagesStatsResponse.ok, true)

console.log('Remote smoke checks passed.')
