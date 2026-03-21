const { chromium } = require('@playwright/test')

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const APP_URL = 'http://127.0.0.1:4173/#top'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const userDataDir = process.env.ARGUE_CHROME_PROFILE_DIR
  const apiKey = process.env.ARGUE_OPENROUTER_API_KEY
  const headless = process.env.ARGUE_HEADLESS !== 'false'
  const stepDelayMs = Number(process.env.ARGUE_STEP_DELAY_MS || 2500)
  const keepOpenMs = Number(process.env.ARGUE_KEEP_OPEN_MS || 0)
  const leaveOpen = process.env.ARGUE_LEAVE_OPEN === 'true'

  if (!userDataDir) {
    throw new Error('ARGUE_CHROME_PROFILE_DIR is required')
  }

  if (!apiKey) {
    throw new Error('ARGUE_OPENROUTER_API_KEY is required')
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: CHROME_PATH,
    headless,
    viewport: { width: 1440, height: 900 },
    slowMo: headless ? 0 : 250,
  })

  const page = context.pages()[0] ?? (await context.newPage())
  const logs = []

  page.on('console', (msg) => logs.push(`console:${msg.type()}:${msg.text()}`))
  page.on('pageerror', (err) => logs.push(`pageerror:${err.message}`))

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('.topbar-account-button').first().waitFor({ timeout: 30000 })
  await sleep(stepDelayMs)

  const accountButton = page.locator('.topbar-account-button').first()
  await accountButton.click()
  await sleep(stepDelayMs)

  await page.locator('.auth-settings-toggle').first().click()
  await sleep(stepDelayMs)
  const apiKeyInput = page.locator('input[placeholder="sk-or-v1-..."]').first()
  await apiKeyInput.click()
  await page.keyboard.press('Meta+A').catch(() => {})
  await page.keyboard.press('Backspace').catch(() => {})
  await apiKeyInput.pressSequentially(apiKey, { delay: 60 })
  await sleep(stepDelayMs)
  await page.getByRole('button', { name: /save key/i }).click()
  await page.getByText(/api key saved/i).waitFor({ timeout: 15000 })
  await sleep(stepDelayMs)

  await page.keyboard.press('Escape').catch(() => {})
  await sleep(stepDelayMs)
  await page.getByRole('button', { name: /chat/i }).click().catch(() => {})
  await sleep(stepDelayMs)

  await page.locator('.model-selector-trigger').first().click()
  await sleep(stepDelayMs)
  const firstModel = page.locator('.model-list-select').first()
  const selectedModelName = (await firstModel.locator('.model-list-name').textContent())?.trim() || ''
  const selectedModelId = (await firstModel.locator('.model-list-id').textContent())?.trim() || ''
  await firstModel.click()
  await sleep(stepDelayMs)

  const prompt = 'Reply with exactly: OPENROUTER_TEST_OK'
  await page.locator('textarea.prompt-textarea').click()
  await page.locator('textarea.prompt-textarea').pressSequentially(prompt, { delay: 50 })
  await sleep(stepDelayMs)
  await page.locator('button.prompt-submit').click()

  const assistantBubble = page.locator('.chat-row-assistant .chat-bubble-assistant').last()
  await assistantBubble.waitFor({ timeout: 20000 })
  await page.waitForFunction(
    () => {
      const bubbles = Array.from(document.querySelectorAll('.chat-row-assistant .chat-bubble-assistant'))
      const last = bubbles[bubbles.length - 1]
      return Boolean(last && last.textContent && last.textContent.trim().length > 0 && !last.textContent.includes('Thinking'))
    },
    { timeout: 90000 },
  )

  const assistantText = (await assistantBubble.innerText()).trim()
  const savedKey = await page.evaluate(() => window.localStorage.getItem('argue-openrouter-api-key'))

  console.log(JSON.stringify({
    selectedModelName,
    selectedModelId,
    assistantText,
    apiKeySaved: Boolean(savedKey && savedKey.startsWith('sk-or-v1-')),
    logs,
  }, null, 2))

  if (keepOpenMs > 0) {
    await sleep(keepOpenMs)
  }

  if (leaveOpen) {
    process.on('SIGTERM', async () => {
      await context.close()
      process.exit(0)
    })
    process.on('SIGINT', async () => {
      await context.close()
      process.exit(0)
    })
    await new Promise(() => {})
  }

  await context.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})