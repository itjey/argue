import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'

// Register the COI service worker so SharedArrayBuffer is available.
// This lets the Python runner use Atomics.wait() for blocking input() calls
// without a browser prompt dialog. On first load the page reloads once.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + 'coi-serviceworker.js')
    .then(() => {
      if (!crossOriginIsolated) {
        // Guard against infinite reload if the browser does not support
        // COOP restrict-properties (the value used by the service worker).
        const key = '__coi_reload'
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1')
          location.reload()
        }
      } else {
        sessionStorage.removeItem('__coi_reload')
      }
    })
    .catch(e => console.warn('[COI-SW] failed:', e))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
