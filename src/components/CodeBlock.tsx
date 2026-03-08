import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Play, X, Loader, RotateCcw } from 'lucide-react'

// ─── Global panel coordination ────────────────────────────────────────────
let closeActivePanel: (() => void) | null = null
function registerPanel(closer: () => void) {
  if (closeActivePanel && closeActivePanel !== closer) closeActivePanel()
  closeActivePanel = closer
}
function unregisterPanel(closer: () => void) {
  if (closeActivePanel === closer) closeActivePanel = null
}

// ─── Types ────────────────────────────────────────────────────────────────
type RunResult =
  | { type: 'html'; content: string }
  | { type: 'text'; stdout: string; stderr: string; exitCode: number; plots?: string[] }
  | { type: 'error'; message: string }

// ─── Godbolt compiler map (verified IDs, latest stable) ──────────────────
const GODBOLT: Record<string, { compiler: string; lang: string; userArguments?: string }> = {
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

const HTML_LANGS = new Set(['html', 'svg', 'xml'])
const JS_LANGS   = new Set(['javascript', 'js', 'jsx'])

export function isRunnable(langId: string): boolean {
  const id = langId.toLowerCase()
  return HTML_LANGS.has(id) || JS_LANGS.has(id) || id === 'python' || id === 'py' || id in GODBOLT
}

// ─── Persistent Pyodide iframe ────────────────────────────────────────────
// One hidden iframe lives for the whole page session; Pyodide (~10 MB) loads
// once and is reused for all subsequent Python runs.
let _pyIframe: HTMLIFrameElement | null = null
type PyState = 'idle' | 'loading' | 'ready' | 'error'
let _pyState: PyState = 'idle'
type PyPending = { resolve: (r: RunResult) => void; tid: ReturnType<typeof setTimeout> }
const _pyPending = new Map<number, PyPending>()
let _pyExecId = 0
const _pyReadyCallbacks: Array<() => void> = []

const PYODIDE_HTML = `<!DOCTYPE html><html><body><script type="module">
(async () => {
  try {
    const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs');
    const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/' });
    // Pre-configure matplotlib Agg backend so imports work seamlessly
    await pyodide.runPythonAsync(\`
try:
  import matplotlib
  matplotlib.use('Agg')
except: pass
\`);
    window.parent.postMessage({ __py: true, type: 'ready' }, '*');
    window.addEventListener('message', async (ev) => {
      if (!ev.data?.__py || ev.data.type !== 'run') return;
      const { id, code } = ev.data;
      let stdout = '', stderr = '';
      pyodide.setStdout({ batched: s => { stdout += s + '\\n' } });
      pyodide.setStderr({ batched: s => { stderr += s + '\\n' } });
      let exitCode = 0;
      try {
        await pyodide.loadPackagesFromImports(code);
        const wrapped = code + \`
# capture any matplotlib figures left open
try:
  import matplotlib.pyplot as _plt
  import io as _io, base64 as _b64
  for _fn in _plt.get_fignums():
    _buf = _io.BytesIO()
    _plt.figure(_fn).savefig(_buf, format='png', bbox_inches='tight', dpi=100)
    _buf.seek(0)
    print('__PLOT__' + _b64.b64encode(_buf.read()).decode())
  _plt.close('all')
except: pass
\`;
        await pyodide.runPythonAsync(wrapped);
      } catch(e) { stderr += e.message; exitCode = 1; }
      window.parent.postMessage({ __py: true, type: 'result', id, stdout, stderr, exitCode }, '*');
    });
  } catch(e) {
    window.parent.postMessage({ __py: true, type: 'error', message: 'Failed to load Python runtime: ' + e.message }, '*');
  }
})();
<\/script></body></html>`

function initPyodideIframe() {
  if (_pyIframe) return
  _pyIframe = document.createElement('iframe')
  _pyIframe.setAttribute('sandbox', 'allow-scripts')
  _pyIframe.style.cssText = 'position:fixed;top:-9999px;opacity:0;width:1px;height:1px;pointer-events:none'
  document.body.appendChild(_pyIframe)
  _pyState = 'loading'

  window.addEventListener('message', (ev: MessageEvent) => {
    if (!ev.data?.__py) return
    if (ev.data.type === 'ready') {
      _pyState = 'ready'
      _pyReadyCallbacks.splice(0).forEach(cb => cb())
    } else if (ev.data.type === 'error') {
      _pyState = 'error'
      _pyPending.forEach(p => {
        clearTimeout(p.tid)
        p.resolve({ type: 'error', message: ev.data.message })
      })
      _pyPending.clear()
    } else if (ev.data.type === 'result') {
      const p = _pyPending.get(ev.data.id)
      if (!p) return
      clearTimeout(p.tid)
      _pyPending.delete(ev.data.id)
      // extract __PLOT__ lines from stdout
      const lines = (ev.data.stdout as string).split('\n')
      const plots: string[] = []
      const clean: string[] = []
      for (const l of lines) {
        if (l.startsWith('__PLOT__')) plots.push(l.slice(8))
        else clean.push(l)
      }
      const stdout = clean.join('\n').replace(/\n+$/, '')
      p.resolve({ type: 'text', stdout, stderr: (ev.data.stderr as string).replace(/\n+$/, ''), exitCode: ev.data.exitCode, plots: plots.length ? plots : undefined })
    }
  })

  _pyIframe.srcdoc = PYODIDE_HTML
}

function runPython(code: string, onStatus: (s: string) => void): Promise<RunResult> {
  return new Promise((resolve) => {
    initPyodideIframe()

    const execId = ++_pyExecId
    const doRun = () => {
      onStatus('running')
      const tid = setTimeout(() => {
        _pyPending.delete(execId)
        resolve({ type: 'error', message: 'Execution timed out (60 s). Try a shorter program.' })
      }, 60000)
      _pyPending.set(execId, { resolve, tid })
      _pyIframe!.contentWindow?.postMessage({ __py: true, type: 'run', id: execId, code }, '*')
    }

    if (_pyState === 'ready') {
      doRun()
    } else if (_pyState === 'loading') {
      onStatus('loading')
      _pyReadyCallbacks.push(doRun)
    } else if (_pyState === 'error') {
      resolve({ type: 'error', message: 'Python runtime failed to load. Reload the page to retry.' })
    } else {
      onStatus('loading')
      _pyReadyCallbacks.push(doRun)
    }
  })
}

// ─── JavaScript sandbox ───────────────────────────────────────────────────
let _jsId = 0
function runJavaScript(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const execId = ++_jsId
    const src = `<!DOCTYPE html><html><body><script>
var __L=[],__E=[]
var _l=console.log,_e=console.error,_w=console.warn,_i=console.info
var _f=function(v){return typeof v==='object'?JSON.stringify(v,null,2):String(v)}
console.log=function(){__L.push([].slice.call(arguments).map(_f).join(' '));_l.apply(console,arguments)}
console.warn=function(){__L.push('⚠ '+[].slice.call(arguments).map(_f).join(' '));_w.apply(console,arguments)}
console.error=function(){__E.push([].slice.call(arguments).map(_f).join(' '));_e.apply(console,arguments)}
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
    function cleanup() { clearTimeout(tid); window.removeEventListener('message', handler); if (iframe.parentNode) document.body.removeChild(iframe) }
    function handler(ev: MessageEvent) {
      if (ev.data?.__jsId !== execId) return
      cleanup()
      resolve({ type: 'text', stdout: (ev.data.l as string[]).join('\n'), stderr: (ev.data.e as string[]).join('\n'), exitCode: ev.data.x })
    }
    window.addEventListener('message', handler)
    iframe.srcdoc = src
  })
}

// ─── Godbolt execution ────────────────────────────────────────────────────
async function runWithGodbolt(langId: string, code: string): Promise<RunResult> {
  const cfg = GODBOLT[langId.toLowerCase()]
  if (!cfg) return { type: 'error', message: `No execution runtime for "${langId}". Supported: Python, C/C++, Go, Rust, Java, Kotlin, Swift, Haskell, Ruby, HTML, JavaScript.` }

  const body = {
    source: code,
    options: {
      userArguments: cfg.userArguments ?? '',
      executeParameters: { args: [], stdin: '' },
      compilerOptions: { executorRequest: true },
      filters: { execute: true },
      tools: [],
      libraries: [],
    },
    lang: cfg.lang,
  }

  const res = await fetch(`https://godbolt.org/api/compiler/${cfg.compiler}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Godbolt ${res.status}${txt ? ': ' + txt.slice(0, 200) : ''}`)
  }

  const d = await res.json()
  const exec = d.execResult ?? d
  const join = (arr: Array<{ text: string }> = []) => arr.map(l => l.text).join('\n')
  const stdout = join(exec.stdout)
  const buildErr = join(exec.buildResult?.stderr)
  const runErr = join(exec.stderr)
  const stderr = [buildErr, runErr].filter(Boolean).join('\n')
  return { type: 'text', stdout, stderr, exitCode: exec.code ?? 0 }
}

// ─── Component ────────────────────────────────────────────────────────────
interface Props { code: string; langId: string; label: string; children: ReactNode }

export function CodeBlock({ code, langId, label, children }: Props) {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'running'>('idle')
  const [result, setResult] = useState<RunResult | null>(null)
  const [open, setOpen] = useState(false)
  const closeFnRef = useRef<() => void>(() => setOpen(false))
  useEffect(() => { closeFnRef.current = () => setOpen(false) })

  function close() { setOpen(false); unregisterPanel(closeFnRef.current) }

  async function run() {
    registerPanel(closeFnRef.current)
    setOpen(true)
    setRunning(true)
    setResult(null)
    setStatus('running')

    try {
      const id = langId.toLowerCase()
      if (HTML_LANGS.has(id)) {
        setResult({ type: 'html', content: code })
      } else if (JS_LANGS.has(id)) {
        setResult(await runJavaScript(code))
      } else if (id === 'python' || id === 'py') {
        setStatus('loading')
        setResult(await runPython(code, s => setStatus(s as 'loading' | 'running')))
      } else {
        setResult(await runWithGodbolt(id, code))
      }
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Execution failed.' })
    } finally {
      setRunning(false)
      setStatus('idle')
    }
  }

  const runnable = isRunnable(langId)

  // Status label shown in the panel while running
  const statusLabel = status === 'loading' ? 'Loading Python runtime (first run ~10 s)…'
    : status === 'running' ? 'Running…'
    : null

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
        {running || !result ? (
          <div className="code-canvas-loading">
            <Loader size={14} className="code-run-spinner" />
            <span>{statusLabel ?? 'Running…'}</span>
          </div>
        ) : result.type === 'html' ? (
          <iframe
            className="code-canvas-iframe"
            sandbox="allow-scripts allow-pointer-lock allow-downloads allow-modals allow-forms"
            srcDoc={result.content}
            title="Preview"
          />
        ) : result.type === 'text' ? (
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
        ) : result.type === 'error' ? (
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
