const { chromium } = require('@playwright/test')

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const APP_URL = 'http://127.0.0.1:4173/#top'
const TARGET_EMAIL = 'jeynarayan2010@gmail.com'

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if (await locator.isVisible().catch(() => false)) {
      await locator.click()
      return selector
    }
  }

  return null
}

async function main() {
  const userDataDir = process.env.ARGUE_CHROME_PROFILE_DIR

  if (!userDataDir) {
    throw new Error('ARGUE_CHROME_PROFILE_DIR is required')
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: CHROME_PATH,
    headless: false,
    viewport: { width: 1440, height: 900 },
  })

  const page = context.pages()[0] ?? (await context.newPage())
  const logs = []

  page.on('console', (msg) => {
    logs.push(`console:${msg.type()}:${msg.text()}`)
  })

  page.on('pageerror', (err) => {
    logs.push(`pageerror:${err.message}`)
  })

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /login/i }).click()

  const popupPromise = page.waitForEvent('popup', { timeout: 15_000 })
  await page.getByRole('button', { name: /continue with google/i }).click()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => {})

  let action = 'none'

  const emailButton = popup.getByText(TARGET_EMAIL, { exact: false }).first()
  if (await emailButton.isVisible().catch(() => false)) {
    await emailButton.click()
    action = 'clicked-known-account'
  } else {
    const chooseAccountSelector = await clickFirstVisible(popup, [
      'div[role="link"][data-identifier]',
      'li [data-identifier]',
      'div[data-identifier]',
      'div[role="button"][data-identifier]',
    ])

    if (chooseAccountSelector) {
      action = `clicked-account-chooser:${chooseAccountSelector}`
    }
  }

  await popup.waitForTimeout(5_000)
  await page.waitForTimeout(5_000)

  const signedInEmail = await page.locator('text=' + TARGET_EMAIL).allTextContents().catch(() => [])
  const signOutVisible = await page.getByRole('button', { name: /sign out/i }).isVisible().catch(() => false)
  const popupStillOpen = !popup.isClosed()

  const result = {
    action,
    popupUrl: popup.url(),
    popupTitle: await popup.title().catch(() => ''),
    popupBody: (await popup.locator('body').innerText().catch(() => '')).slice(0, 1500),
    signOutVisible,
    signedInEmail,
    pageBody: (await page.locator('body').innerText()).slice(0, 3000),
    pageUrl: page.url(),
    popupStillOpen,
    logs,
  }

  console.log(JSON.stringify(result, null, 2))

  await context.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})