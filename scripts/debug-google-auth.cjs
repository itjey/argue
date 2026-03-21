const { chromium } = require('@playwright/test')

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const logs = []

  page.on('console', (msg) => {
    logs.push(`console:${msg.type()}:${msg.text()}`)
  })

  page.on('pageerror', (err) => {
    logs.push(`pageerror:${err.message}`)
  })

  await page.goto('http://127.0.0.1:4173/#top', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /login/i }).click()

  const popupPromise = page.waitForEvent('popup', { timeout: 10_000 }).catch(() => null)
  await page.getByRole('button', { name: /continue with google/i }).click()

  const popup = await popupPromise
  await page.waitForTimeout(3_000)

  const state = {
    popupOpened: Boolean(popup),
    popupUrl: popup ? popup.url() : null,
    popupTitle: '',
    popupBody: '',
    errorTexts: await page
      .locator('.auth-feedback-error, [role="alert"]')
      .allTextContents()
      .catch(() => []),
    body: (await page.locator('body').innerText()).slice(0, 2500),
    logs,
  }

  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {})
    state.popupUrl = popup.url()
    state.popupTitle = await popup.title().catch(() => '')
    state.popupBody = (await popup.locator('body').innerText().catch(() => '')).slice(0, 1200)
  }

  console.log(JSON.stringify(state, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})