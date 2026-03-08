/*
  Pyodide Web Worker
  SharedArrayBuffer layout (4104 bytes):
    [0..3]   Int32  status   — 0 = waiting, 1 = data ready
    [4..7]   Int32  byteLen  — length of UTF-8 string in data region
    [8..4103] Uint8  data    — UTF-8 encoded input string (up to 4096 bytes)
*/
importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js');

const STDIN_SIZE = 4096;
let pyodide = null;
let stdinBuf = null; // SharedArrayBuffer set by main thread

// ─── init ─────────────────────────────────────────────────────────────────
async function initPyodide(buffer) {
  stdinBuf = buffer;

  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/',
  });

  // Expose a JS function callable from Python via `from js import __worker_input`.
  // It must be on globalThis (= self in a worker), NOT pyodide.globals — that's
  // Python's namespace. Pyodide's `js` module reflects JavaScript's globalThis.
  self.__worker_input = prompt => {
    // Signal the main thread that we need input, passing the prompt text
    self.postMessage({ type: 'input_request', prompt: String(prompt || '') });

    // Block this Worker thread until the main thread writes the value
    const statusView = new Int32Array(stdinBuf, 0, 1);
    Atomics.store(statusView, 0, 0);
    Atomics.wait(statusView, 0, 0); // blocks until status becomes non-zero

    // Read the user's value back out of the buffer
    const lenView = new Int32Array(stdinBuf, 4, 1);
    const byteView = new Uint8Array(stdinBuf, 8, lenView[0]);
    return new TextDecoder().decode(byteView);
  };

  await pyodide.runPythonAsync(`
import builtins
from js import __worker_input

def _patched_input(prompt=''):
    return __worker_input(str(prompt) if prompt else '')

builtins.input = _patched_input

try:
    import matplotlib
    matplotlib.use('Agg')
except ImportError:
    pass
`);

  self.postMessage({ type: 'ready' });
}

// ─── run ──────────────────────────────────────────────────────────────────
async function runCode(id, code) {
  const stdoutLines = [];
  const stderrLines = [];

  pyodide.setStdout({
    batched: text => {
      stdoutLines.push(text);
      // Stream each line to the terminal in real-time
      self.postMessage({ type: 'stdout', id, text: text + '\n' });
    },
  });
  pyodide.setStderr({
    batched: text => {
      stderrLines.push(text);
      self.postMessage({ type: 'stderr', id, text: text + '\n' });
    },
  });

  let exitCode = 0;
  try {
    await pyodide.loadPackagesFromImports(code);
    await pyodide.runPythonAsync(code);
  } catch (err) {
    const msg = err.message || String(err);
    stderrLines.push(msg);
    self.postMessage({ type: 'stderr', id, text: msg + '\n' });
    exitCode = 1;
  }

  // Capture any remaining matplotlib figures
  const plots = [];
  try {
    const proxy = await pyodide.runPythonAsync(`
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
`);
    if (proxy?.toJs) { plots.push(...proxy.toJs()); proxy.destroy(); }
  } catch (_) { /* matplotlib not used */ }

  self.postMessage({ type: 'done', id, exitCode, plots });
}

// ─── message handler ──────────────────────────────────────────────────────
self.onmessage = async e => {
  const { type } = e.data;
  if (type === 'init') {
    try {
      await initPyodide(e.data.buffer);
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message || String(err) });
    }
  } else if (type === 'run') {
    try {
      await runCode(e.data.id, e.data.code);
    } catch (err) {
      self.postMessage({ type: 'done', id: e.data.id, exitCode: 1, plots: [] });
    }
  }
};
