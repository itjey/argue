import { useState, useRef, type ReactNode, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Play, X, Loader, RotateCcw, CornerDownLeft } from 'lucide-react'

// ─── Panel coordination ───────────────────────────────────────────────────
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

type InputReq = { execId: number; reqId: number; prompt: string }

// ─── Godbolt compiler map ─────────────────────────────────────────────────
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

const HTML_LANGS = new Set(['html', 'svg', 'xml'])
const JS_LANGS   = new Set(['javascript', 'js', 'jsx'])

export function isRunnable(langId: string): boolean {
  const id = langId.toLowerCase()
  return HTML_LANGS.has(id) || JS_LANGS.has(id) || id === 'python' || id === 'py' || id in GODBOLT
}

// ─── Persistent Pyodide iframe (singleton) ────────────────────────────────
let _pyIframe: HTMLIFrameElement | null = null
type PyState = 'idle' | 'loading' | 'ready' | 'error'
let _pyState: PyState = 'idle'

type PyPending = {
  resolve: (r: RunResult) => void
  tid: ReturnType<typeof setTimeout>
}
const _pyPending = new Map<number, PyPending>()
let _pyExecId = 0
const _pyReadyCbs: Array<() => void> = []

// Callbacks set by the currently-running component instance
let _onInputReq: ((req: InputReq, stdoutChunk: string) => void) | null = null
// _onPlotReady reserved for future use

// The Pyodide iframe HTML — override input(), capture plots, stream partial stdout
const PYODIDE_HTML = `<!DOCTYPE html><html><body><script type="module">
(async () => {
  try {
    const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.mjs');
    const pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/' });

    // Pre-configure matplotlib Agg backend
    await pyodide.runPythonAsync(\`
try:
  import matplotlib
  matplotlib.use('Agg')
except: pass
\`);

    window.inputCallbacks = {};
    let execId = 0;
    let stdoutTotal = '';
    let stdoutSent = 0;

    pyodide.setStdout({ batched: s => { stdoutTotal += s + '\\n'; } });
    pyodide.setStderr({ batched: s => {} }); // captured via try/except in run

    // Override input() with an async version that messages the parent
    await pyodide.runPythonAsync(\`
import builtins, asyncio, js as _js
from pyodide.ffi import create_proxy, to_js

_req_id = [0]
_exec_id = [0]

async def _py_input(prompt=''):
    rid = _req_id[0]; _req_id[0] += 1
    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    def _cb(val):
        if not fut.done():
            fut.set_result('' if val is None else str(val))
    prx = create_proxy(_cb)
    _js.window.inputCallbacks[rid] = prx
    # flush prompt to parent along with accumulated stdout
    _js.window.parent.postMessage(
        to_js({
            '__py': True, 'type': 'input_request',
            'exec_id': _exec_id[0], 'req_id': rid, 'prompt': str(prompt)
        }, dict_converter=_js.Object.fromEntries), '*')
    try:
        return await fut
    finally:
        prx.destroy()

builtins.input = _py_input
\`);

    window.parent.postMessage({ __py: true, type: 'ready' }, '*');

    window.addEventListener('message', async (ev) => {
      const d = ev.data;
      if (!d?.__py) return;

      if (d.type === 'input_response') {
        const cb = window.inputCallbacks[d.req_id];
        if (cb) { delete window.inputCallbacks[d.req_id]; cb(d.value); }
        return;
      }

      if (d.type === 'run') {
        execId = d.id;
        stdoutTotal = '';
        stdoutSent = 0;
        // update _py_input's exec_id
        pyodide.globals.get('_exec_id')[0] = execId;

        let exitCode = 0;
        let stderr = '';
        try {
          await pyodide.loadPackagesFromImports(d.code);
          await pyodide.runPythonAsync(d.code);
        } catch(e) { stderr = e.message || String(e); exitCode = 1; }

        // Capture matplotlib plots
        let plots = [];
        try {
          const proxy = await pyodide.runPythonAsync(\`
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
except:
  []
\`);
          if (proxy?.toJs) { plots = [...proxy.toJs()]; proxy.destroy(); }
        } catch(e) {}

        // Send remaining stdout chunk (since last input_request or start)
        const remainingStdout = stdoutTotal.slice(stdoutSent);

        window.parent.postMessage({
          __py: true, type: 'result', id: execId,
          remainingStdout, stderr, exitCode, plots
        }, '*');
      }

      if (d.type === 'input_request_ack') {
        // parent acknowledged; capture stdout chunk sent so far
        const chunk = stdoutTotal.slice(stdoutSent);
        stdoutSent = stdoutTotal.length;
        window.parent.postMessage({ __py: true, type: 'stdout_chunk', exec_id: execId, text: chunk }, '*');
      }
    });
  } catch(e) {
    window.parent.postMessage({ __py: true, type: 'error', message: 'Failed to load Python: ' + e.message }, '*');
  }
})();
<\/script></body></html>`

// We actually need the iframe to flush stdout synchronously when input() is called.
// The trick: when the Python code posts input_request, the event loop is still
// spinning (we're inside an async Python function). We need the parent to ACK so
// the iframe can capture the stdout chunk before yielding to the user.
// Solution: use a modified flow where the iframe posts the input_request, the
// parent immediately posts input_request_ack, then the iframe sends the stdout chunk.
// The parent waits for the stdout_chunk message before showing the input field.

function initPyodideIframe() {
  if (_pyIframe) return
  _pyIframe = document.createElement('iframe')
  _pyIframe.setAttribute('sandbox', 'allow-scripts')
  _pyIframe.style.cssText = 'position:fixed;top:-9999px;opacity:0;width:1px;height:1px;pointer-events:none'
  document.body.appendChild(_pyIframe)
  _pyState = 'loading'

  window.addEventListener('message', (ev: MessageEvent) => {
    const d = ev.data
    if (!d?.__py) return

    if (d.type === 'ready') {
      _pyState = 'ready'
      _pyReadyCbs.splice(0).forEach(cb => cb())

    } else if (d.type === 'error') {
      _pyState = 'error'
      _pyPending.forEach(p => { clearTimeout(p.tid); p.resolve({ type: 'error', message: d.message }) })
      _pyPending.clear()

    } else if (d.type === 'input_request') {
      // ACK so the iframe can flush its stdout buffer
      _pyIframe!.contentWindow?.postMessage({ __py: true, type: 'input_request_ack' }, '*')
      // We'll get a stdout_chunk next, then surface to component
      _pendingInputReq = { execId: d.exec_id, reqId: d.req_id, prompt: d.prompt }

    } else if (d.type === 'stdout_chunk') {
      // Paired with input_request_ack; now surface to component
      if (_pendingInputReq) {
        _onInputReq?.(_pendingInputReq, d.text ?? '')
        _pendingInputReq = null
      }

    } else if (d.type === 'result') {
      const p = _pyPending.get(d.id)
      if (!p) return
      clearTimeout(p.tid)
      _pyPending.delete(d.id)
      const plots: string[] = d.plots ?? []
      p.resolve({
        type: 'text',
        stdout: d.remainingStdout ?? '',
        stderr: d.stderr ?? '',
        exitCode: d.exitCode ?? 0,
        plots: plots.length ? plots : undefined,
      })
    }
  })

  _pyIframe.srcdoc = PYODIDE_HTML
}

let _pendingInputReq: InputReq | null = null

function runPython(
  code: string,
  onStatus: (s: string) => void,
  onInputReq: (req: InputReq, stdoutChunk: string) => void,
  _onPlot: (b64: string) => void,
): Promise<RunResult> {
  return new Promise((resolve) => {
    initPyodideIframe()
    _onInputReq = onInputReq
    // onPlot reserved

    const execId = ++_pyExecId
    const doRun = () => {
      onStatus('running')
      const tid = setTimeout(() => {
        _pyPending.delete(execId)
        _onInputReq = null
        resolve({ type: 'error', message: 'Execution timed out (60 s).' })
      }, 60000)
      _pyPending.set(execId, { resolve, tid })
      _pyIframe!.contentWindow?.postMessage({ __py: true, type: 'run', id: execId, code }, '*')
    }

    if (_pyState === 'ready') { doRun() }
    else if (_pyState === 'loading') { onStatus('loading'); _pyReadyCbs.push(doRun) }
    else if (_pyState === 'error') { resolve({ type: 'error', message: 'Python runtime failed to load. Reload the page to retry.' }) }
    else { onStatus('loading'); _pyReadyCbs.push(doRun) }
  })
}

// ─── JS sandbox ───────────────────────────────────────────────────────────
let _jsId = 0
function runJavaScript(code: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const execId = ++_jsId
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

// ─── Godbolt ──────────────────────────────────────────────────────────────
async function runWithGodbolt(langId: string, code: string): Promise<RunResult> {
  const cfg = GODBOLT[langId.toLowerCase()]
  if (!cfg) return { type: 'error', message: `No execution runtime for "${langId}". Supported: Python, C/C++, Go, Rust, Java, Kotlin, Swift, Haskell, Ruby, HTML, JavaScript.` }

  const res = await fetch(`https://godbolt.org/api/compiler/${cfg.compiler}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      source: code,
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

  if (!res.ok) throw new Error(`Godbolt ${res.status}`)
  const d = await res.json()
  const exec = d.execResult ?? d
  const join = (arr: Array<{ text: string }> = []) => arr.map(l => l.text).join('\n')
  return {
    type: 'text',
    stdout: join(exec.stdout),
    stderr: [join(exec.buildResult?.stderr), join(exec.stderr)].filter(Boolean).join('\n'),
    exitCode: exec.code ?? 0,
  }
}

// ─── Component ────────────────────────────────────────────────────────────
interface Props { code: string; langId: string; label: string; children: ReactNode }

export function CodeBlock({ code, langId, label, children }: Props) {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'running'>('idle')
  const [open, setOpen] = useState(false)

  // Live Python output (conversation view: output + prompts + responses)
  const [liveOut, setLiveOut] = useState('')
  const [liveErr, setLiveErr] = useState('')
  const [livePlots, setLivePlots] = useState<string[]>([])
  const [isPython, setIsPython] = useState(false)
  const [exitCode, setExitCode] = useState(0)

  // Non-Python / final results
  const [result, setResult] = useState<RunResult | null>(null)

  // Interactive input state
  const [inputReq, setInputReq] = useState<InputReq | null>(null)
  const [inputDraft, setInputDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const closeFnRef = useRef<() => void>(() => setOpen(false))
  closeFnRef.current = () => setOpen(false)

  function close() { setOpen(false); unregisterPanel(closeFnRef.current) }

  async function run() {
    registerPanel(closeFnRef.current)
    setOpen(true)
    setRunning(true)
    setResult(null)
    setLiveOut('')
    setLiveErr('')
    setLivePlots([])
    setInputReq(null)
    setInputDraft('')
    setStatus('running')

    const id = langId.toLowerCase()
    const pyLang = id === 'python' || id === 'py'
    setIsPython(pyLang)

    try {
      if (HTML_LANGS.has(id)) {
        setResult({ type: 'html', content: code })
      } else if (JS_LANGS.has(id)) {
        setResult(await runJavaScript(code))
      } else if (pyLang) {
        const handleInputReq = (req: InputReq, chunk: string) => {
          setLiveOut(prev => prev + chunk)
          setInputReq(req)
          // focus input on next tick
          setTimeout(() => inputRef.current?.focus(), 50)
        }
        const res = await runPython(code, s => setStatus(s as 'loading' | 'running'), handleInputReq, () => {})
        _onInputReq = null
        if (res.type === 'text') {
          setLiveOut(prev => (prev + res.stdout).trimEnd() || '')
          setLiveErr(res.stderr?.trimEnd() ?? '')
          setLivePlots(res.plots ?? [])
          setExitCode(res.exitCode)
        } else {
          setResult(res)
        }
      } else {
        setResult(await runWithGodbolt(id, code))
      }
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Execution failed.' })
    } finally {
      setRunning(false)
      setStatus('idle')
      setInputReq(null)
    }
  }

  function submitInput() {
    if (!inputReq) return
    const val = inputDraft
    setInputDraft('')
    setInputReq(null)
    // Echo prompt + response into live output
    setLiveOut(prev => prev + (inputReq.prompt ?? '') + val + '\n')
    _pyIframe?.contentWindow?.postMessage({
      __py: true, type: 'input_response',
      exec_id: inputReq.execId, req_id: inputReq.reqId, value: val,
    }, '*')
  }

  function onInputKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); submitInput() }
  }

  const statusLabel = status === 'loading'
    ? 'Loading Python runtime (first run ~10 s)…'
    : 'Running…'

  // What to show in the panel body
  const showPython = isPython && (running || liveOut || liveErr || livePlots.length > 0)
  const hasFinalText = result?.type === 'text' && !running
  const hasFinalErr  = result?.type === 'error'

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
        {/* ── HTML preview ── */}
        {result?.type === 'html' && (
          <iframe
            className="code-canvas-iframe"
            sandbox="allow-scripts allow-pointer-lock allow-downloads allow-modals allow-forms"
            srcDoc={result.content}
            title="Preview"
          />
        )}

        {/* ── Python interactive view ── */}
        {showPython && (
          <div className="code-canvas-output">
            {liveOut && <pre className="code-canvas-stdout">{liveOut}</pre>}
            {livePlots.map((p, i) => (
              <img key={i} src={`data:image/png;base64,${p}`} alt="Plot" className="code-canvas-plot" />
            ))}
            {liveErr && <pre className="code-canvas-stderr">{liveErr}</pre>}
            {!running && !liveOut && !liveErr && !livePlots.length && (
              <span className="code-canvas-empty">No output.</span>
            )}
            {!running && exitCode !== 0 && (
              <div className="code-canvas-exit-code">Exit {exitCode}</div>
            )}

            {/* Input field when input() is called */}
            {running && inputReq !== null ? (
              <div className="code-runner-input-row">
                <span className="code-runner-input-prompt">{inputReq.prompt || '> '}</span>
                <input
                  ref={inputRef}
                  className="code-runner-input"
                  value={inputDraft}
                  onChange={e => setInputDraft(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder="Type and press Enter…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="code-runner-input-send" type="button" onClick={submitInput} title="Submit">
                  <CornerDownLeft size={13} />
                </button>
              </div>
            ) : running ? (
              <div className="code-canvas-loading">
                <Loader size={14} className="code-run-spinner" />
                <span>{statusLabel}</span>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Non-Python text result ── */}
        {hasFinalText && result.type === 'text' && (
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
        )}

        {/* ── Error ── */}
        {hasFinalErr && result.type === 'error' && (
          <div className="code-canvas-error">{result.message}</div>
        )}

        {/* ── Initial loading spinner (before any output) ── */}
        {running && !showPython && result === null && (
          <div className="code-canvas-loading">
            <Loader size={14} className="code-run-spinner" />
            <span>{statusLabel}</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null

  const runnable = isRunnable(langId)
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
