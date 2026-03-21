const fs = require('fs')
const path = require('path')
const { chromium } = require('@playwright/test')

const firebaseToolsPath = path.join(
  process.env.HOME,
  '.config',
  'configstore',
  'firebase-tools.json',
)

const firebaseConfig = {
  apiKey: 'AIzaSyAqHQ46s488VGbZpmTZetnLTyzDLemJFEU',
  authDomain: 'argue-app-2026.firebaseapp.com',
  projectId: 'argue-app-2026',
  storageBucket: 'argue-app-2026.firebasestorage.app',
  messagingSenderId: '589955566087',
  appId: '1:589955566087:web:023ddc973e2c4b48ad78a2',
}

async function main() {
  const firebaseTools = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'))
  const accessToken = firebaseTools?.tokens?.access_token
  const idToken = firebaseTools?.tokens?.id_token
  const email = firebaseTools?.user?.email

  if (!accessToken || !idToken) {
    throw new Error('Missing Google tokens in firebase-tools.json')
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const logs = []

  page.on('console', (msg) => logs.push(`console:${msg.type()}:${msg.text()}`))
  page.on('pageerror', (err) => logs.push(`pageerror:${err.message}`))

  await page.goto('http://127.0.0.1:4173/#top', { waitUntil: 'networkidle' })

  const result = await page.evaluate(
    async ({ accessToken: browserAccessToken, idToken: browserIdToken, browserEmail, browserConfig }) => {
      const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js')
      const {
        browserLocalPersistence,
        getAuth,
        GoogleAuthProvider,
        setPersistence,
        signInWithCredential,
      } = await import('https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js')

      const app = getApps().length ? getApp() : initializeApp(browserConfig)
      const auth = getAuth(app)
      await setPersistence(auth, browserLocalPersistence)

      const credential = GoogleAuthProvider.credential(browserIdToken, browserAccessToken)
      const signInResult = await signInWithCredential(auth, credential)

      return {
        email: signInResult.user.email,
        uid: signInResult.user.uid,
        emailVerified: signInResult.user.emailVerified,
        expectedEmail: browserEmail,
      }
    },
    {
      accessToken,
      idToken,
      email,
      browserConfig: firebaseConfig,
    },
  )

  await page.waitForTimeout(4000)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /login/i }).click()
  await page.waitForTimeout(1000)

  const body = await page.locator('body').innerText()
  const signOutVisible = await page.getByRole('button', { name: /sign out/i }).isVisible().catch(() => false)

  console.log(
    JSON.stringify(
      {
        authResult: result,
        signOutVisible,
        loggedInEmailVisible: body.includes(result.email || ''),
        body: body.slice(0, 3000),
        logs,
      },
      null,
      2,
    ),
  )

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})