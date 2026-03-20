import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'

// Unregister any previously installed COI service worker.
// An older version injected Cross-Origin-Opener-Policy headers that break
// Firebase Auth's signInWithPopup (popup can't postMessage back to opener).
// The Python runner's prompt()-based fallback works fine without it.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const reg of registrations) {
      reg.unregister().then(ok => {
        if (ok) console.info('[SW] unregistered', reg.scope)
      })
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
