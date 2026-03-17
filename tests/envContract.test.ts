import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSurfacePreset,
  parseRuntimeConfig,
  validateEnvironment,
} from '../src/lib/envContract.ts'

test('parseRuntimeConfig defaults browser mode and server base correctly', () => {
  const browserConfig = parseRuntimeConfig({})
  const serverConfig = parseRuntimeConfig({
    VITE_OPENROUTER_AUTH_MODE: 'server',
  })

  assert.equal(browserConfig.openRouterAuthMode, 'browser')
  assert.equal(browserConfig.configuredOpenRouterApiBase, '')
  assert.equal(serverConfig.openRouterAuthMode, 'server')
  assert.equal(serverConfig.configuredOpenRouterApiBase, '/api/v1')
})

test('pages surface rejects root-relative server API bases', () => {
  const report = validateEnvironment(
    {
      ...getSurfacePreset('pages'),
      VITE_OPENROUTER_AUTH_MODE: 'server',
      VITE_OPENROUTER_API_BASE: '/api/v1',
    },
    'pages',
  )

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.level === 'error' &&
        issue.key === 'VITE_OPENROUTER_API_BASE',
    ),
  )
})

test('local server surface warns about missing secrets without strict mode', () => {
  const report = validateEnvironment(
    {
      ...getSurfacePreset('local-server'),
    },
    'local-server',
  )

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.level === 'warning' &&
        issue.key === 'OPENROUTER_API_KEY',
    ),
  )
})

test('railway surface treats missing secrets as errors in strict mode', () => {
  const report = validateEnvironment(
    {
      ...getSurfacePreset('railway'),
      ALLOWED_ORIGINS: 'https://itjey.github.io',
    },
    'railway',
    { strictSecrets: true },
  )

  assert.ok(
    report.issues.some(
      (issue) =>
        issue.level === 'error' &&
        issue.key === 'OPENROUTER_API_KEY',
    ),
  )
})
