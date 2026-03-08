import { useState, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Play, X, Loader, RotateCcw } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════════
   Panel coordination — only one output panel open at a time
   ═══════════════════════════════════════════════════════════════════════════ */
let closeActivePanel: (() => void) | null = null
function registerPanel(closer: () => void) {
  if (closeActivePanel && closeActivePanel !== closer) closeActivePanel()
  closeActivePanel = closer
}
function unregisterPanel(closer: () => void) {
  if (closeActivePanel === closer) closeActivePanel = null
}

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════ */
type RunResult =
  | { type: 'html'; content: string }
  | { type: 'text'; stdout: string; stderr: string; exitCode: number; plots?: string[] }
  | { type: 'error'; message: string }

/* ═══════════════════════════════════════════════════════════════════════════
   Language detection
   ═══════════════════════════════════════════════════════════════════════════ */
const HTML_LANGS = new Set(['html', 'svg', 'xml'])
const JS_LANGS   = new Set(['javascript', 'js', 'jsx'])

const GODBOLT: Record<string, { compiler: string; lang: string }> = {
  cpp:     { compiler: 'g152',        lang: 'c++' },
  'c++':   { compiler: 'g152',        lang: 'c++' },
  cxx:     { compiler: 'g152',        lang: 'c++' },
  c:       { compiler: 'cg152',       lang: 'c' },
  go:      { compiler: 'gl1260',      lang: 'go' },
  golang:  { compiler: 'gl1260',      lang: 'go' },
  rust:    { compiler: 'r1940',       lang: 'rust' },
  rs:      { compiler: 'r1940',       lang: 'rust' },
  java:    { compiler: 'java2501',    lang: 'java' },
  kotlin:  { compiler: 'kotlinc2220', lang: 'kotlin' },
  swift:   { compiler: 'swift62',     lang: 'swift' },
  haskell: { compiler: 'ghc9122',     lang: 'haskell' },
  hs:      { compiler: 'ghc9122',     lang: 'haskell' },
  ruby:    { compiler: 'ruby347',     lang: 'ruby' },
  rb:      { compiler: 'ruby347',     lang: 'ruby' },
}

export function isRunnable(langId: string): boolean {
  const id = langId.toLowerCase()
  return HTML_LANGS.has(id) || JS_LANGS.has(id) || id === 'python' || id === 'py' || id in GODBOLT
}

/* ═══════════════════════════════════════════════════════════════════════════
   Python — Pyodide loaded once in main thread
   ═══════════════════════════════════════════════════════════════════════════
   • Runs entirely in the browser via WebAssembly (no server needed)
   • Auto-installs any imported package (numpy, pandas, matplotlib, scipy…)
   • input() is patched to use window.prompt() — works for games/interactive code
   • Matplotlib figures are captured as PNG images
   ═══════════════════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pyodide: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pyodideP: Promise<any> | null = null

async function ensurePyodide() {
  if (_pyodide) return _pyodide
  if (_pyodideP) return _pyodideP

  _pyodideP = (async () => {
    // Load the Pyodide loader script from CDN if not already present
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).loadPyodide) {
      await new Promise<void>((ok, fail) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js'
        s.onload = () => ok()
        s.onerror = () => fail(new Error('Failed to load Python runtime from CDN.'))
        document.head.appendChild(s)
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const py = await (window as any).loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/',
    })

    // Patch input() → window.prompt() and pre-configure matplotlib
    py.runPython(`
import builtins
from js import prompt as _js_prompt

def _patched_input(p=''):
    r = _js_prompt(str(p) if p else 'Enter input:')
    return '' if r is None else str(r)

builtins.input = _patched_input

try:
    import matplotlib
    matplotlib.use('Agg')
except ImportError:
    pass
`)
    _pyodide = py
    return py
  })()

  return _pyodideP
}

async function executePython(code: string, onStatus: (s: string) => void): Promise<RunResult> {
  onStatus('loading')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let py: any
  try {
    py = await ensurePyodide()
  } catch (e: unknown) {
    return { type: 'error', message: e instanceof Error ? e.message : 'Failed to load Python runtime.' }
  }

  onStatus('running')

  let stdout = '', stderr = ''
  py.setStdout({ batched: (s: string) => { stdout += s + '\n' } })
  py.setStderr({ batched: (s: string) => { stderr += s + '\n' } })

  let exitCode = 0
  try {
    await py.loadPackagesFromImports(code)
    await py.runPythonAsync(code)
  } catch (e: unknown) {
    stderr += (e instanceof Error ? e.message : String(e))
    exitCode = 1
  }

  // Capture any open matplotlib figures
  const plots: string[] = []
  try {
    const proxy = await py.runPythonAsync(`
try:
    import matplotlib.pyplot as _plt
    import io as _io, base64 as _b64
    _arg_plots = []
    for _fn in _plt.get_fignums():
        _buf = _io.BytesIO()
        _plt.figure(_fn).savefig(_buf, format='png', bbox_inches='tight', dpi=100)
        _buf.seek(0)
        _arg_plots.append(_b64.b64encode(_buf.read()).decode())
    _plt.close('all')
    _arg_plots
except Exception:
    []
`)
    if (proxy?.toJs) {
      plots.push(...proxy.toJs())
      proxy.destroy()
    }
  } catch { /* matplotlib not imported — fine */ }

  return {
    type: 'text',
    stdout: stdout.replace(/\n+$/, ''),
    stderr: stderr.replace(/\n+$/, ''),
    exitCode,
    plots: plots.length ? plots : undefined,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   JavaScript — sandboxed iframe with console capture
   ═══════════════════════════════════════════════════════════════════════════ */
let _jsExecId = 0

function runJavaScript(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const execId = ++_jsExecId
    const src = `<!DOCTYPE html><html><body><script>
var __L=[],__E=[]
var _f=function(v){return typeof v==='object'?JSON.stringify(v,null,2):String(v)}
var _log=console.log,_err=console.error,_warn=console.warn
console.log=function(){__L.push([].slice.call(arguments).map(_f).join(' '));_log.apply(console,arguments)}
console.warn=function(){__L.push('⚠ '+[].slice.call(arguments).map(_f).join(' '));_warn.apply(console,arguments)}
console.error=function(){__E.push([].slice.call(arguments).map(_f).join(' '));_err.apply(console,arguments)}
console.info=console.log
var __X=0
try{${code}}catch(e){__E.push(e.message);__X=1}
window.parent.postMessage({__jsId:${execId},l:__L,e:__E,x:__X},'*')
<\/script></body></html>`

    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.style.cssText = 'position:fixed;top:-9999px;opacity:0;width:1px;height:1px;pointer-events:none'
    document.body.appendChild(iframe)

    const tid = setTimeout(() => { cleanup(); resolve({ type: 'text', stdout: '', stderr: 'Timed out after 5 s.', exitCode: 124 }) }, 5000)
    const cleanup = () => { clearTimeout(tid); window.removeEventListener('message', handler); if (iframe.parentNode) document.body.removeChild(iframe) }
    const handler = (ev: MessageEvent) => {
      if (ev.data?.__jsId !== execId) return
      cleanup()
      resolve({ type: 'text', stdout: (ev.data.l as string[]).join('\n'), stderr: (ev.data.e as string[]).join('\n'), exitCode: ev.data.x })
    }
    window.addEventListener('message', handler)
    iframe.srcdoc = src
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   Compiled languages — Godbolt Compiler Explorer API
   ═══════════════════════════════════════════════════════════════════════════ */
function preprocessForGodbolt(langId: string, code: string): string {
  // Java: Godbolt feeds source as <source>, so "public class X" fails
  // because the filename doesn't match. Strip the "public" keyword.
  if (langId === 'java') {
    return code.replace(/public\s+class\s+/g, 'class ')
  }
  return code
}

async function runWithGodbolt(langId: string, code: string): Promise<RunResult> {
  const cfg = GODBOLT[langId.toLowerCase()]
  if (!cfg) {
    return { type: 'error', message: `No runtime for "${langId}". Supported: Python, C/C++, Go, Rust, Java, Kotlin, Swift, Haskell, Ruby, HTML, JavaScript.` }
  }

  const processedCode = preprocessForGodbolt(langId.toLowerCase(), code)

  const res = await fetch(`https://godbolt.org/api/compiler/${cfg.compiler}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      source: processedCode,
      options: {
        userArguments: '',
        executeParameters: { args: [], stdin: '' },
        compilerOptions: { executorRequest: true },
        filters: { execute: true },
        tools: [],
        libraries: [],
      },
      lang: cfg.lang,
    }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Godbolt returned ${res.status}${txt ? ': ' + txt.slice(0, 200) : ''}`)
  }

  const d = await res.json()
  const exec = d.execResult ?? d
  const join = (arr?: Array<{ text: string }>) => (arr ?? []).map(l => l.text).join('\n')
  return {
    type: 'text',
    stdout: join(exec.stdout),
    stderr: [join(exec.buildResult?.stderr), join(exec.stderr)].filter(Boolean).join('\n'),
    exitCode: exec.code ?? 0,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CodeBlock component
   ═══════════════════════════════════════════════════════════════════════════ */
interface Props { code: string; langId: string; label: string; children: ReactNode }

export function CodeBlock({ code, langId, label, children }: Props) {
  const [running, setRunning] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [result, setResult] = useState<RunResult | null>(null)
  const [open, setOpen] = useState(false)

  const closeFnRef = useRef<() => void>(() => setOpen(false))
  closeFnRef.current = () => setOpen(false)

  function close() { setOpen(false); unregisterPanel(closeFnRef.current) }

  async function run() {
    registerPanel(closeFnRef.current)
    setOpen(true)
    setRunning(true)
    setResult(null)
    setStatusMsg('Running…')

    try {
      const id = langId.toLowerCase()

      if (HTML_LANGS.has(id)) {
        setResult({ type: 'html', content: code })
      } else if (JS_LANGS.has(id)) {
        setResult(await runJavaScript(code))
      } else if (id === 'python' || id === 'py') {
        setResult(await executePython(code, (s) => {
          setStatusMsg(s === 'loading' ? 'Loading Python (first run ~10 s)…' : 'Running…')
        }))
      } else {
        setResult(await runWithGodbolt(id, code))
      }
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Execution failed.' })
    } finally {
      setRunning(false)
      setStatusMsg('')
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
            <span>{statusMsg || 'Running…'}</span>
          </div>

        ) : result?.type === 'html' ? (
          <iframe
            className="code-canvas-iframe"
            sandbox="allow-scripts allow-pointer-lock allow-downloads allow-modals allow-forms"
            srcDoc={result.content}
            title="Preview"
          />

        ) : result?.type === 'text' ? (
          <div className="code-canvas-output">
            {result.stdout && <pre className="code-canvas-stdout">{result.stdout}</pre>}
            {result.plots?.map((p, i) => (
              <img key={i} src={`data:image/png;base64,${p}`} alt="Plot" className="code-canvas-plot" />
            ))}
            {result.stderr && <pre className="code-canvas-stderr">{result.stderr}</pre>}
            {!result.stdout && !result.stderr && !result.plots?.length && (
              <span className="code-canvas-empty">No output.</span>
            )}
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
                type="button"
                onClick={run}
                disabled={running}
                title={running ? 'Running…' : 'Run'}
              >
                {running
                  ? <Loader size={11} className="code-run-spinner" />
                  : <Play size={11} fill="currentColor" />}
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
