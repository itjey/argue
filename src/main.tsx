import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'

// Register the COI service worker for COEP headers.
// COOP is intentionally omitted so Firebase Auth popup sign-in works.
// The Python runner gracefully falls back to main-thread Pyodide when
// crossOriginIsolated is unavailable.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + 'coi-serviceworker.js')
    .catch(e => console.warn('[COI-SW] failed:', e))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
