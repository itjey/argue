import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const projectRoot = process.cwd()
const port = Number(process.env.SMOKE_PORT ?? 4310)
const baseUrl = `http://127.0.0.1:${port}`

function runNpmScript(scriptName: string) {
  const command =
    process.platform === 'win32'
      ? {
          executable: 'cmd.exe',
          args: ['/d', '/s', '/c', `npm run ${scriptName}`],
        }
      : {
          executable: 'npm',
          args: ['run', scriptName],
        }

  const result = spawnSync(command.executable, command.args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

async function waitForResponse(url: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url)

      if (response.ok) {
        return response
      }
    } catch {
      // The server can still be starting; retry below.
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

runNpmScript('build:server')

const serverProcess = spawn(
  process.execPath,
  ['server/index.mjs'],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ALLOWED_ORIGINS: `${baseUrl},http://localhost:${port}`,
    },
    stdio: 'inherit',
  },
)

try {
  const healthResponse = await waitForResponse(`${baseUrl}/api/health`)
  const health = (await healthResponse.json()) as {
    ok?: boolean
    serverManagedOpenRouter?: boolean
  }

  assert.equal(health.ok, true)
  assert.equal(typeof health.serverManagedOpenRouter, 'boolean')

  const homeHtml = await (await fetch(baseUrl)).text()
  assert.match(homeHtml, /<div id="root"><\/div>/)
  assert.match(homeHtml, /\/assets\//)
  assert.ok(!homeHtml.includes('/argue/assets/'))

  const notFoundHtml = await (await fetch(`${baseUrl}/rooms/demo`)).text()
  assert.match(notFoundHtml, /<div id="root"><\/div>/)

  const serviceWorkerResponse = await fetch(`${baseUrl}/coi-serviceworker.js`)
  assert.equal(serviceWorkerResponse.status, 200)

  const pythonWorkerResponse = await fetch(`${baseUrl}/py-worker.js`)
  assert.equal(pythonWorkerResponse.status, 200)

  console.log('Local smoke checks passed.')
} finally {
  serverProcess.kill()
  await delay(250)

  if (!serverProcess.killed) {
    serverProcess.kill('SIGKILL')
  }
}
