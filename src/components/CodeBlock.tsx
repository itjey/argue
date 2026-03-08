import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Play, X, Loader, RotateCcw } from 'lucide-react'

// ── Global panel coordination: only one panel open at a time ──────────────
let closeActivePanel: (() => void) | null = null
function registerPanel(closer: () => void) {
  if (closeActivePanel && closeActivePanel !== closer) closeActivePanel()
  closeActivePanel = closer
}
function unregisterPanel(closer: () => void) {
  if (closeActivePanel === closer) closeActivePanel = null
}

// ── Types ─────────────────────────────────────────────────────────────────
type RunResult =
  | { type: 'html'; content: string }
  | { type: 'text'; stdout: string; stderr: string; exitCode: number }
  | { type: 'error'; message: string }

// ── Language sets ──────────────────────────────────────────────────────────
const HTML_LANGS  = new Set(['html', 'svg'])
const JS_LANGS    = new Set(['javascript', 'js', 'jsx'])

// Wandbox compiler map — uses -head for latest, specific version where needed
const WANDBOX: Record<string, { compiler: string; options?: string; raw?: string }> = {
  python: { compiler: 'cpython-head' },
  py:     { compiler: 'cpython-head' },
  cpp:    { compiler: 'gcc-head', options: 'warning,c++17' },
  'c++':  { compiler: 'gcc-head', options: 'warning,c++17' },
  cxx:    { compiler: 'gcc-head', options: 'warning,c++17' },
  c:      { compiler: 'gcc-head', options: 'warning', raw: '-x c' },
  ruby:   { compiler: 'ruby-head' },
  rb:     { compiler: 'ruby-head' },
  go:     { compiler: 'go-head' },
  golang: { compiler: 'go-head' },
  rust:   { compiler: 'rust-head' },
  rs:     { compiler: 'rust-head' },
  haskell:{ compiler: 'ghc-head' },
  hs:     { compiler: 'ghc-head' },
  php:    { compiler: 'php-head' },
  perl:   { compiler: 'perl-head' },
  pl:     { compiler: 'perl-head' },
  lua:    { compiler: 'lua-head' },
  elixir: { compiler: 'elixir-head' },
  ex:     { compiler: 'elixir-head' },
  erlang: { compiler: 'erlang-head' },
  bash:   { compiler: 'bash' },
  sh:     { compiler: 'bash' },
  shell:  { compiler: 'bash' },
  zsh:    { compiler: 'bash' },
  swift:  { compiler: 'swift-head' },
  ocaml:  { compiler: 'ocaml-head' },
  ml:     { compiler: 'ocaml-head' },
  r:      { compiler: 'r-head' },
  // TypeScript via Wandbox Node.js + ts-node
  typescript: { compiler: 'typescript-5.2.2' },
  ts:         { compiler: 'typescript-5.2.2' },
  tsx:        { compiler: 'typescript-5.2.2' },
  java:   { compiler: 'openjdk-head' },
  kotlin: { compiler: 'kotlin-head' },
  scala:  { compiler: 'scala-head' },
  nim:    { compiler: 'nim-head' },
  d:      { compiler: 'dmd-head' },
  crystal:{ compiler: 'crystal-head' },
}

export function isRunnable(langId: string): boolean {
  const id = langId.toLowerCase()
  return HTML_LANGS.has(id) || JS_LANGS.has(id) || id in WANDBOX
}

// ── JavaScript sandbox ────────────────────────────────────────────────────
let _jsId = 0
function runJavaScript(code: string): Promise<RunResult> {
  const execId = ++_jsId
  return new Promise((resolve) => {
    const src = `<!DOCTYPE html><html><body><script>
const __L=[],__E=[]
const _l=console.log,_e=console.error,_w=console.warn
const _fmt=v=>typeof v==='object'?JSON.stringify(v,null,2):String(v)
console.log=(...a)=>{__L.push(a.map(_fmt).join(' '));_l(...a)}
console.warn=(...a)=>{__L.push('⚠ '+a.map(_fmt).join(' '));_w(...a)}
console.error=(...a)=>{__E.push(a.map(_fmt).join(' '));_e(...a)}
let __X=0
try{${code}}catch(e){__E.push(e.message);__X=1}
window.parent.postMessage({__jsId:${execId},l:__L,e:__E,x:__X},'*')
<\/script></body></html>`

    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.style.cssText = 'position:fixed;top:-9999px;opacity:0;width:1px;height:1px;pointer-events:none'
    document.body.appendChild(iframe)

    const tid = setTimeout(() => {
      cleanup()
      resolve({ type: 'text', stdout: '', stderr: 'Timed out after 5s.', exitCode: 124 })
    }, 5000)

    function cleanup() {
      clearTimeout(tid)
      window.removeEventListener('message', handler)
      if (iframe.parentNode) document.body.removeChild(iframe)
    }
    function handler(ev: MessageEvent) {
      if (ev.data?.__jsId !== execId) return
      cleanup()
      resolve({ type: 'text', stdout: ev.data.l.join('\n'), stderr: ev.data.e.join('\n'), exitCode: ev.data.x })
    }
    window.addEventListener('message', handler)
    iframe.srcdoc = src
  })
}

// ── Wandbox API ───────────────────────────────────────────────────────────
async function runWithWandbox(langId: string, code: string): Promise<RunResult> {
  const cfg = WANDBOX[langId.toLowerCase()]
  if (!cfg) return { type: 'error', message: `No execution runtime available for "${langId}". Supported: Python, C/C++, Go, Rust, Ruby, Java, TypeScript, Bash, PHP, Haskell, Lua, and more.` }

  const body: Record<string, string> = { code, compiler: cfg.compiler }
  if (cfg.options) body.options = cfg.options
  if (cfg.raw) body['compiler-option-raw'] = cfg.raw

  const res = await fetch('https://wandbox.org/api/compile.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Wandbox API ${res.status}${text ? ': ' + text.slice(0, 300) : ''}`)
  }

  const d = await res.json()
  const stdout = [d.program_output, d.compiler_output].filter(Boolean).join('')
  const stderr = [d.program_error, d.compiler_error].filter(Boolean).join('')
  return { type: 'text', stdout, stderr, exitCode: parseInt(d.status ?? '0', 10) }
}

// ── Component ─────────────────────────────────────────────────────────────
interface Props { code: string; langId: string; label: string; children: ReactNode }

export function CodeBlock({ code, langId, label, children }: Props) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [open, setOpen] = useState(false)
  const closeFnRef = useRef<() => void>(() => {})

  useEffect(() => {
    const fn = () => setOpen(false)
    closeFnRef.current = fn
  })

  function close() {
    setOpen(false)
    unregisterPanel(closeFnRef.current)
  }

  async function run() {
    registerPanel(closeFnRef.current)
    setOpen(true)
    setRunning(true)
    setResult(null)
    try {
      const id = langId.toLowerCase()
      if (HTML_LANGS.has(id)) {
        setResult({ type: 'html', content: code })
      } else if (JS_LANGS.has(id)) {
        setResult(await runJavaScript(code))
      } else {
        setResult(await runWithWandbox(id, code))
      }
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Execution failed.' })
    } finally {
      setRunning(false)
    }
  }

  const runnable = isRunnable(langId)

  const panel = open ? createPortal(
    <div className="code-runner-panel">
      <div className="code-runner-header">
        <span className="code-runner-title">{label || 'Output'}</span>
        <div className="code-runner-header-actions">
          <button className="code-runner-action-btn" type="button" onClick={run} disabled={running} title="Re-run">
            {running ? <Loader size={12} className="code-run-spinner" /> : <RotateCcw size={12} />}
          </button>
          <button className="code-runner-action-btn" type="button" onClick={close} title="Close">
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="code-runner-body">
        {running ? (
          <div className="code-canvas-loading">
            <Loader size={14} className="code-run-spinner" />
            <span>Running…</span>
          </div>
        ) : result?.type === 'html' ? (
          <iframe className="code-canvas-iframe" sandbox="allow-scripts allow-forms allow-modals" srcDoc={result.content} title="Preview" />
        ) : result?.type === 'text' ? (
          <div className="code-canvas-output">
            {result.stdout && <pre className="code-canvas-stdout">{result.stdout}</pre>}
            {result.stderr && <pre className="code-canvas-stderr">{result.stderr}</pre>}
            {!result.stdout && !result.stderr && <span className="code-canvas-empty">No output.</span>}
            {result.exitCode !== 0 && <div className="code-canvas-exit-code">Exit {result.exitCode}</div>}
          </div>
        ) : result?.type === 'error' ? (
          <div className="code-canvas-error">{result.message}</div>
        ) : null}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <div className={`code-block-wrapper${open ? ' code-block-active' : ''}`}>
        <div className="code-block-header">
          {label && <span className="code-block-lang">{label}</span>}
          <div className="code-block-header-actions">
            {runnable && (
              <button
                className={`code-block-run-btn${open ? ' code-block-run-btn-on' : ''}`}
                type="button" onClick={run} disabled={running}
                title={running ? 'Running…' : 'Run'}
              >
                {running ? <Loader size={11} className="code-run-spinner" /> : <Play size={11} fill="currentColor" />}
              </button>
            )}
          </div>
        </div>
        <pre className="code-block-pre">{children}</pre>
      </div>
      {panel}
    </>
  )
}
