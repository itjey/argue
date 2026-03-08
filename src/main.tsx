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
    .then(() => { if (!crossOriginIsolated) location.reload() })
    .catch(e => console.warn('[COI-SW] failed:', e))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
