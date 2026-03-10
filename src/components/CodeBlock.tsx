import { useState, useRef, useEffect, useCallback, type ReactNode, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Play, X, Loader, RotateCcw, Terminal } from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════════════
   Panel coordination — only one output panel open at a time
   ═══════════════════════════════════════════════════════════════════════════ */
let closeActivePanel: (() => void) | null = null
let reopenActivePanel: (() => void) | null = null
let hasMinimizedPanel = false
let minimizedListeners: Array<(v: boolean) => void> = []

function notifyMinimized(v: boolean) {
  hasMinimizedPanel = v
  minimizedListeners.forEach(fn => fn(v))
}

function registerPanel(closer: () => void, reopener: () => void) {
  if (closeActivePanel && closeActivePanel !== closer) closeActivePanel()
  closeActivePanel = closer
  reopenActivePanel = reopener
  notifyMinimized(false)
}
function minimizePanel() {
  notifyMinimized(true)
}
function tryReopen() {
  if (reopenActivePanel) {
    reopenActivePanel()
    notifyMinimized(false)
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Minimized tab — rendered once via a dedicated component
   ═══════════════════════════════════════════════════════════════════════════ */
function MinimizedTab() {
  const [visible, setVisible] = useState(hasMinimizedPanel)
  useEffect(() => {
    minimizedListeners.push(setVisible)
    return () => { minimizedListeners = minimizedListeners.filter(fn => fn !== setVisible) }
  }, [])
  if (!visible) return null
  return createPortal(
    <button className="code-runner-minimized-tab" type="button" onClick={tryReopen} title="Restore terminal">
      <Terminal size={13} />
      <span>Terminal</span>
    </button>,
    document.body
  )
}

// Mount the minimized tab once
let _minimizedMounted = false
function ensureMinimizedTab() {
  if (_minimizedMounted) return
  _minimizedMounted = true
  const el = document.createElement('div')
  el.id = 'minimized-tab-root'
  document.body.appendChild(el)
  // Use React 19 createRoot
  import('react-dom/client').then(({ createRoot }) => {
    createRoot(el).render(<MinimizedTab />)
  })
}

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
   Pyodide Web Worker singleton
   ═══════════════════════════════════════════════════════════════════════════
   A single Worker + SharedArrayBuffer is shared across all CodeBlock instances.
   The SharedArrayBuffer (4104 bytes) is used to pass user input to the blocking
   Atomics.wait() call inside the worker.
   ═══════════════════════════════════════════════════════════════════════════ */
const SAB_SIZE = 4104 // 4 (status) + 4 (len) + 4096 (data)
let _worker: Worker | null = null
let _workerReady = false
let _workerError: string | null = null
let _sharedBuf: SharedArrayBuffer | null = null
let _workerReadyCbs: Array<() => void> = []

// Per-run callbacks registered by the active CodeBlock
let _onStdout: ((text: string) => void) | null = null
let _onStderr: ((text: string) => void) | null = null
let _onDone: ((exitCode: number, plots: string[]) => void) | null = null
let _onInputReq: ((prompt: string) => void) | null = null

function getOrCreateWorker(): Promise<void> {
  if (_workerReady) return Promise.resolve()
  if (_workerError) return Promise.reject(new Error(_workerError))

  return new Promise((resolve, reject) => {
    if (_workerReady) { resolve(); return }
    if (_workerError) { reject(new Error(_workerError)); return }

    _workerReadyCbs.push(() => resolve())

    if (_worker) return // already initializing

    if (!crossOriginIsolated) {
      // SharedArrayBuffer requires COOP/COEP. If not isolated yet (SW not yet
      // active), fall back to prompt()-based Pyodide on main thread.
      reject(new Error('__NOT_ISOLATED__'))
      return
    }

    _sharedBuf = new SharedArrayBuffer(SAB_SIZE)
    _worker = new Worker(import.meta.env.BASE_URL + 'py-worker.js')

    _worker.onmessage = (e: MessageEvent) => {
      const d = e.data
      switch (d.type) {
        case 'ready':
          _workerReady = true
          _workerReadyCbs.splice(0).forEach(cb => cb())
          break
        case 'error':
          _workerError = d.message
          _workerReadyCbs.splice(0).forEach(() => {})
          reject(new Error(d.message))
          break
        case 'stdout':
          _onStdout?.(d.text)
          break
        case 'stderr':
          _onStderr?.(d.text)
          break
        case 'input_request':
          _onInputReq?.(d.prompt)
          break
        case 'done':
          _onDone?.(d.exitCode, d.plots ?? [])
          break
      }
    }

    _worker.postMessage({ type: 'init', buffer: _sharedBuf })
  })
}

function sendInputToWorker(value: string) {
  if (!_sharedBuf) return
  const encoded = new TextEncoder().encode(value.slice(0, 4096))
  const lenView = new Int32Array(_sharedBuf, 4, 1)
  const dataView = new Uint8Array(_sharedBuf, 8, encoded.length)
  lenView[0] = encoded.length
  dataView.set(encoded)
  const statusView = new Int32Array(_sharedBuf, 0, 1)
  Atomics.store(statusView, 0, 1)
  Atomics.notify(statusView, 0, 1)
}

/* ═══════════════════════════════════════════════════════════════════════════
   Fallback: Pyodide on main thread with window.prompt()
   Used when crossOriginIsolated = false (SW not yet active, or unsupported)
   ═══════════════════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pyodideMain: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pyodideMainP: Promise<any> | null = null

async function ensurePyodideMain() {
  if (_pyodideMain) return _pyodideMain
  if (_pyodideMainP) return _pyodideMainP
  _pyodideMainP = (async () => {
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
    const py = await (window as any).loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/' })
    py.runPython(`
import builtins
from js import prompt as _js_prompt
builtins.input = lambda p='': (r := _js_prompt(str(p) or 'Input:')) and r or ''
try:
    import matplotlib; matplotlib.use('Agg')
except ImportError:
    pass
`)
    _pyodideMain = py
    return py
  })()
  return _pyodideMainP
}

/* ═══════════════════════════════════════════════════════════════════════════
   JS sandbox
   ═══════════════════════════════════════════════════════════════════════════ */
let _jsExecId = 0
type RunResult =
  | { type: 'html'; content: string }
  | { type: 'text'; stdout: string; stderr: string; exitCode: number; plots?: string[] }
  | { type: 'error'; message: string }

function runJavaScript(code: string): Promise<RunResult> {
  return new Promise(resolve => {
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

    const tid = setTimeout(() => { cleanup(); resolve({ type: 'text', stdout: '', stderr: 'Timed out (5 s).', exitCode: 124 }) }, 5000)
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
   Godbolt Compiler Explorer
   ═══════════════════════════════════════════════════════════════════════════ */
async function runWithGodbolt(langId: string, code: string): Promise<RunResult> {
  const cfg = GODBOLT[langId.toLowerCase()]
  if (!cfg) return { type: 'error', message: `No runtime for "${langId}". Supported: Python, C/C++, Go, Rust, Java, Kotlin, Swift, Haskell, Ruby, HTML, JavaScript.` }

  // Godbolt requires the class name to match the filename; strip "public" from Java
  const processedCode = langId.toLowerCase() === 'java'
    ? code.replace(/public\s+class\s+/g, 'class ')
    : code

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

  if (!res.ok) throw new Error(`Godbolt returned ${res.status}`)
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
   Terminal line types
   ═══════════════════════════════════════════════════════════════════════════ */
type TermLine =
  | { kind: 'out';   text: string }
  | { kind: 'err';   text: string }
  | { kind: 'echo';  text: string }  // echoed user input

/* ═══════════════════════════════════════════════════════════════════════════
   CodeBlock component
   ═══════════════════════════════════════════════════════════════════════════ */
interface Props { code: string; langId: string; label: string; children: ReactNode }

export function CodeBlock({ code, langId, label, children }: Props) {
  const [running, setRunning] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [open, setOpen] = useState(false)

  // Terminal state
  const [lines, setLines] = useState<TermLine[]>([])
  const [plots, setPlots] = useState<string[]>([])
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [inputPrompt, setInputPrompt] = useState<string | null>(null)
  const [inputDraft, setInputDraft] = useState('')
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Resizable panel height (in vh)
  const [panelHeight, setPanelHeight] = useState(50)
  const draggingRef = useRef(false)

  const termBottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mount minimized tab singleton on first render
  useEffect(() => { ensureMinimizedTab() }, [])

  const reopenFn = useCallback(() => setOpen(true), [])
  const closeFnRef = useRef<() => void>(() => {})
  closeFnRef.current = () => {
    setOpen(false)
    // Stop running code when closing
    setRunning(false)
    setInputPrompt(null)
    _onStdout = null; _onStderr = null; _onInputReq = null; _onDone = null
    minimizePanel()
  }

  // Auto-scroll terminal
  useEffect(() => {
    termBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, plots, inputPrompt])

  // Keep interactive input focused while waiting for stdin.
  useEffect(() => {
    if (open && inputPrompt !== null) inputRef.current?.focus()
  }, [open, inputPrompt])

  function focusLiveInput() {
    if (inputPrompt !== null) inputRef.current?.focus()
  }

  function close() { closeFnRef.current() }

  // Drag-to-resize handler
  function onDragStart(e: ReactMouseEvent) {
    e.preventDefault()
    draggingRef.current = true
    const startY = e.clientY
    const startH = panelHeight

    const onMove = (ev: globalThis.MouseEvent) => {
      if (!draggingRef.current) return
      const deltaVh = ((startY - ev.clientY) / window.innerHeight) * 100
      const newH = Math.max(15, Math.min(85, startH + deltaVh))
      setPanelHeight(newH)
    }
    const onUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function appendLine(kind: TermLine['kind'], text: string) {
    setLines(prev => {
      // Split by newlines, each becomes its own line entry
      const chunks = text.split('\n')
      const newLines: TermLine[] = []
      for (const chunk of chunks) {
        if (chunk) newLines.push({ kind, text: chunk })
      }
      return [...prev, ...newLines]
    })
  }

  async function run() {
    registerPanel(closeFnRef.current, reopenFn)
    setOpen(true)
    setRunning(true)
    setLines([])
    setPlots([])
    setExitCode(null)
    setInputPrompt(null)
    setInputDraft('')
    setHtmlContent(null)
    setErrorMsg(null)
    setStatusMsg('Starting…')

    const id = langId.toLowerCase()

    try {
      if (HTML_LANGS.has(id)) {
        setHtmlContent(code)

      } else if (JS_LANGS.has(id)) {
        const r = await runJavaScript(code)
        if (r.type === 'text') {
          if (r.stdout) appendLine('out', r.stdout)
          if (r.stderr) appendLine('err', r.stderr)
          setExitCode(r.exitCode)
        } else if (r.type === 'error') {
          setErrorMsg(r.message)
        }

      } else if (id === 'python' || id === 'py') {
        await runPython(code)

      } else {
        setStatusMsg('Compiling…')
        const r = await runWithGodbolt(id, code)
        if (r.type === 'text') {
          if (r.stdout) appendLine('out', r.stdout)
          if (r.stderr) appendLine('err', r.stderr)
          setExitCode(r.exitCode)
        } else if (r.type === 'error') {
          setErrorMsg(r.message)
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Execution failed.')
    } finally {
      setRunning(false)
      setStatusMsg('')
      setInputPrompt(null)
    }
  }

  async function runPython(src: string) {
    let runId = Date.now()

    try {
      setStatusMsg('Loading Python…')
      await getOrCreateWorker()
      setStatusMsg('')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === '__NOT_ISOLATED__') {
        // Fall back to main-thread Pyodide (no interactive terminal, uses prompt())
        await runPythonFallback(src)
        return
      }
      throw e
    }

    // Register per-run callbacks
    _onStdout = text => appendLine('out', text)
    _onStderr = text => appendLine('err', text)
    _onInputReq = prompt => {
      setInputPrompt(prompt)
    }
    _onDone = (ec, p) => {
      setExitCode(ec)
      if (p.length) setPlots(prev => [...prev, ...p])
      _onStdout = null
      _onStderr = null
      _onInputReq = null
      _onDone = null
    }

    _worker!.postMessage({ type: 'run', id: runId, code: src })
    // setRunning(false) happens in finally of the parent run() fn, but we need
    // to wait for 'done' here. We do that by returning a Promise.
    await new Promise<void>(resolve => {
      const prev = _onDone
      _onDone = (ec, p) => {
        prev?.(ec, p)
        resolve()
      }
    })
  }

  async function runPythonFallback(src: string) {
    setStatusMsg('Loading Python (first run ~10 s)…')
    const py = await ensurePyodideMain()
    setStatusMsg('Running…')

    let stdout = '', stderr = ''
    py.setStdout({ batched: (s: string) => { stdout += s + '\n'; appendLine('out', s) } })
    py.setStderr({ batched: (s: string) => { stderr += s + '\n'; appendLine('err', s) } })

    let exitCode = 0
    try {
      await py.loadPackagesFromImports(src)
      await py.runPythonAsync(src)
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e)
      appendLine('err', m)
      exitCode = 1
    }

    const plots: string[] = []
    try {
      const proxy = await py.runPythonAsync(`
try:
    import matplotlib.pyplot as _plt, io as _io, base64 as _b64
    _r = []
    for _n in _plt.get_fignums():
        _buf = _io.BytesIO()
        _plt.figure(_n).savefig(_buf, format='png', bbox_inches='tight', dpi=100)
        _buf.seek(0)
        _r.append(_b64.b64encode(_buf.read()).decode())
    _plt.close('all')
    _r
except: []
`)
      if (proxy?.toJs) { plots.push(...proxy.toJs()); proxy.destroy() }
    } catch (_) { /* fine */ }

    setExitCode(exitCode)
    if (plots.length) setPlots(plots)
  }

  function submitInput() {
    const val = inputDraft
    setInputDraft('')
    setInputPrompt(null)
    // Echo the input line into the terminal
    appendLine('echo', (inputPrompt || '') + val)
    sendInputToWorker(val)
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); submitInput() }
  }

  const runnable = isRunnable(langId)
  const isPython = langId.toLowerCase() === 'python' || langId.toLowerCase() === 'py'
  const showTerminal = !htmlContent && (lines.length > 0 || plots.length > 0 || running || exitCode !== null || errorMsg !== null)

  const panel = open ? createPortal(
    <div className="code-runner-panel" style={{ height: `${panelHeight}vh` }}>
      {/* Drag handle for resizing */}
      <div className="code-runner-drag-handle" onMouseDown={onDragStart}>
        <div className="code-runner-drag-bar" />
      </div>
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
        {/* ── HTML preview ── */}
        {htmlContent && (
          <iframe
            className="code-canvas-iframe"
            sandbox="allow-scripts allow-pointer-lock allow-downloads allow-modals allow-forms allow-same-origin"
            srcDoc={htmlContent}
            title="Preview"
          />
        )}

        {/* ── Terminal ── */}
        {(showTerminal || (isPython && running) || !htmlContent) && (
          <div className="code-terminal">
            <div className="code-terminal-output" onMouseDown={focusLiveInput}>
              {lines.map((l, i) => (
                <div key={i} className={`code-terminal-line code-terminal-${l.kind}`}>{l.text}</div>
              ))}
              {plots.map((p, i) => (
                <img key={i} src={`data:image/png;base64,${p}`} alt="Plot" className="code-canvas-plot" />
              ))}
              {errorMsg && <div className="code-terminal-line code-terminal-err">{errorMsg}</div>}
              {!running && exitCode !== null && exitCode !== 0 && (
                <div className="code-terminal-exit">Process exited with code {exitCode}</div>
              )}
              {!running && exitCode !== null && exitCode === 0 && (
                <div className="code-terminal-exit" style={{ color: 'rgba(80, 255, 120, 0.45)' }}>Process exited with code 0</div>
              )}
              {inputPrompt !== null ? (
                <label className="code-terminal-line code-terminal-live-input">
                  {inputPrompt ? <span className="code-terminal-input-prompt">{inputPrompt}</span> : null}
                  <input
                    ref={inputRef}
                    className="code-terminal-input code-terminal-input-inline"
                    value={inputDraft}
                    onChange={e => setInputDraft(e.target.value)}
                    onKeyDown={onInputKey}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={inputPrompt || 'Terminal input'}
                  />
                </label>
              ) : null}
              <div ref={termBottomRef} />
            </div>
          </div>
        )}

        {/* ── Initial loading spinner ── */}
        {running && !showTerminal && !htmlContent && (
          <div className="code-canvas-loading">
            <Loader size={14} className="code-run-spinner" />
            <span>{statusMsg || 'Running…'}</span>
          </div>
        )}
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
