import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const projectRoot = process.cwd()
const port = Number(process.env.SMOKE_BROWSER_PORT ?? 4320)
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

const serverProcess = spawn(process.execPath, ['server/index.mjs'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PORT: String(port),
    ALLOWED_ORIGINS: `${baseUrl},http://localhost:${port}`,
  },
  stdio: 'inherit',
})

try {
  await waitForResponse(`${baseUrl}/api/health`)

  const browser = await chromium.launch({
    headless: true,
  })

  try {
    const pageErrors: string[] = []
    const page = await browser.newPage()
    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForLoadState('networkidle')
    const heroHeading = page.locator('main h1').first()
    await heroHeading.waitFor()

    assert.equal(await page.title(), 'argue')
    assert.match(
      (await heroHeading.textContent()) ?? '',
      /Make frontier models/i,
    )

    const loginButton = page.getByRole('button', { name: /login/i }).first()
    assert.equal(await loginButton.isVisible(), true)
    await loginButton.click()

    const authDialog = page.getByRole('dialog', { name: /sign in to argue/i })
    await authDialog.waitFor()
    assert.equal(
      await authDialog.getByRole('button', { name: /Continue with Google/i }).isVisible(),
      true,
    )
    assert.equal(await authDialog.locator('.auth-primary-button').isVisible(), true)

    assert.deepEqual(pageErrors, [])
    console.log('Browser smoke checks passed.')
  } finally {
    await browser.close()
  }
} finally {
  serverProcess.kill()
  await delay(250)

  if (!serverProcess.killed) {
    serverProcess.kill('SIGKILL')
  }
}
