import { useState, type ReactNode } from 'react'
import { Play, X, Loader } from 'lucide-react'

type RunResult =
  | { type: 'html'; content: string }
  | { type: 'text'; stdout: string; stderr: string; exitCode: number }
  | { type: 'error'; message: string }

// Map our langId to Piston runtime language identifier
const PISTON_LANG: Record<string, string> = {
  python: 'python', py: 'python',
  javascript: 'javascript', js: 'javascript',
  typescript: 'typescript', ts: 'typescript',
  cpp: 'c++', 'c++': 'c++', cxx: 'c++', cc: 'c++',
  c: 'c',
  csharp: 'csharp', cs: 'csharp',
  java: 'java',
  kotlin: 'kotlin', kt: 'kotlin',
  swift: 'swift',
  go: 'go', golang: 'go',
  rust: 'rust', rs: 'rust',
  ruby: 'ruby', rb: 'ruby',
  php: 'php',
  perl: 'perl', pl: 'perl',
  lua: 'lua',
  r: 'r',
  haskell: 'haskell', hs: 'haskell',
  elixir: 'elixir', ex: 'elixir', exs: 'elixir',
  scala: 'scala',
  bash: 'bash', sh: 'bash', shell: 'bash', zsh: 'bash',
  powershell: 'powershell', ps1: 'powershell', pwsh: 'powershell',
  sql: 'sqlite3',
  dart: 'dart',
  groovy: 'groovy',
  julia: 'julia', jl: 'julia',
  nim: 'nim',
  pascal: 'pascal',
  prolog: 'prolog',
  fsharp: 'fsharp', fs: 'fsharp',
  clojure: 'clojure', clj: 'clojure',
  erlang: 'erlang',
  ocaml: 'ocaml', ml: 'ocaml',
  fortran: 'fortran',
  cobol: 'cobol',
  assembly: 'nasm', asm: 'nasm', nasm: 'nasm',
}

const HTML_LANGS = new Set(['html', 'svg'])

export function isRunnable(langId: string): boolean {
  const id = langId.toLowerCase()
  return HTML_LANGS.has(id) || id in PISTON_LANG
}

async function runWithPiston(langId: string, code: string): Promise<RunResult> {
  const pistonLang = PISTON_LANG[langId.toLowerCase()]
  if (!pistonLang) return { type: 'error', message: `No runtime available for "${langId}".` }

  const res = await fetch('https://emkc.org/api/v2/piston/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: pistonLang,
      version: '*',
      files: [{ name: 'main', content: code }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Piston API returned ${res.status}${text ? ': ' + text : ''}`)
  }

  const data = await res.json()
  // Piston returns compile + run steps; prefer run output, fallback to compile
  const step = data.run ?? data.compile ?? {}
  return {
    type: 'text',
    stdout: step.stdout ?? '',
    stderr: step.stderr ?? '',
    exitCode: step.code ?? 0,
  }
}

interface Props {
  code: string
  langId: string
  label: string
  children: ReactNode  // the rendered <code> element from ReactMarkdown
}

export function CodeBlock({ code, langId, label, children }: Props) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [canvasOpen, setCanvasOpen] = useState(false)

  const runnable = isRunnable(langId)

  async function run() {
    setCanvasOpen(true)
    setRunning(true)
    setResult(null)
    try {
      const id = langId.toLowerCase()
      if (HTML_LANGS.has(id)) {
        setResult({ type: 'html', content: code })
      } else {
        setResult(await runWithPiston(id, code))
      }
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Execution failed.' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {label && <span className="code-block-lang">{label}</span>}
        <div className="code-block-header-actions">
          {canvasOpen && (
            <button
              className="code-block-canvas-close"
              type="button"
              onClick={() => setCanvasOpen(false)}
              title="Close output"
            >
              <X size={11} />
            </button>
          )}
          {runnable && (
            <button
              className={`code-block-run-btn${running ? ' code-block-run-btn-spinning' : ''}`}
              type="button"
              onClick={run}
              disabled={running}
              title={running ? 'Running…' : 'Run code'}
            >
              {running
                ? <Loader size={11} className="code-run-spinner" />
                : <Play size={11} fill="currentColor" />
              }
            </button>
          )}
        </div>
      </div>

      <pre className="code-block-pre">{children}</pre>

      {canvasOpen && (
        <div className="code-block-canvas">
          {running ? (
            <div className="code-canvas-loading">
              <Loader size={14} className="code-run-spinner" />
              <span>Running…</span>
            </div>
          ) : result?.type === 'html' ? (
            <iframe
              className="code-canvas-iframe"
              sandbox="allow-scripts allow-forms allow-modals"
              srcDoc={result.content}
              title="HTML Preview"
            />
          ) : result?.type === 'text' ? (
            <div className="code-canvas-output">
              {result.stdout && (
                <pre className="code-canvas-stdout">{result.stdout}</pre>
              )}
              {result.stderr && (
                <pre className="code-canvas-stderr">{result.stderr}</pre>
              )}
              {!result.stdout && !result.stderr && (
                <span className="code-canvas-empty">No output</span>
              )}
              {result.exitCode !== 0 && (
                <div className="code-canvas-exit-code">
                  Exited with code {result.exitCode}
                </div>
              )}
            </div>
          ) : result?.type === 'error' ? (
            <div className="code-canvas-error">{result.message}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
