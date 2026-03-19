import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Download, Loader, RotateCcw } from 'lucide-react'
import { compileLatexToPdf } from '../lib/swiftlatex'

type LatexWorkspacePanelProps = {
  hidden?: boolean
  initialSource: string
  inline?: boolean
  label: string
  onHide: () => void
  open: boolean
}

const AUTO_COMPILE_DELAY_MS = 900
const MIN_EDITOR_WIDTH = 24
const MAX_EDITOR_WIDTH = 76

function sanitizeFilename(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'latex-document'
}

function extractLatexError(log: string, status: number) {
  const lines = log.split('\n').map((line) => line.trimEnd())
  const errorIndex = lines.findIndex((line) => line.startsWith('! '))

  if (errorIndex >= 0) {
    return lines
      .slice(errorIndex, Math.min(errorIndex + 4, lines.length))
      .filter(Boolean)
      .join('\n')
  }

  const tail = lines.filter(Boolean).slice(-8).join('\n')

  if (tail) {
    return tail
  }

  return `Compilation failed with status ${status}.`
}

function getStatusText(
  compiling: boolean,
  compileError: string | null,
  pdfUrl: string | null,
  hidden: boolean,
) {
  if (hidden) {
    return 'Workspace hidden. Restore it from the right edge.'
  }

  if (compiling) {
    return 'Compiling in the browser and fetching packages on demand…'
  }

  if (compileError && pdfUrl) {
    return 'Last compile failed. Showing the most recent successful PDF.'
  }

  if (compileError) {
    return 'Compilation failed. Check the log for details.'
  }

  if (pdfUrl) {
    return 'PDF preview is up to date.'
  }

  return 'Ready to compile.'
}

function LatexWorkspacePanel({
  hidden = false,
  initialSource,
  inline = false,
  label,
  onHide,
  open,
}: LatexWorkspacePanelProps) {
  const [source, setSource] = useState(initialSource)
  const [editorWidth, setEditorWidth] = useState(42)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compileLog, setCompileLog] = useState('')
  const [compileError, setCompileError] = useState<string | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [autoCompile, setAutoCompile] = useState(true)
  const [showLog, setShowLog] = useState(false)
  const [lastCompiledAt, setLastCompiledAt] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragWidthRef = useRef(editorWidth)
  const lastCompiledSourceRef = useRef<string | null>(null)
  const latestCompileRequestRef = useRef(0)
  const previousInitialSourceRef = useRef(initialSource)

  useEffect(() => {
    if (initialSource === previousInitialSourceRef.current) {
      return
    }

    setSource((currentSource) =>
      currentSource === previousInitialSourceRef.current ? initialSource : currentSource,
    )
    previousInitialSourceRef.current = initialSource
  }, [initialSource])

  useEffect(() => {
    dragWidthRef.current = editorWidth
  }, [editorWidth])

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [pdfUrl])

  const compileSource = useCallback(async (nextSource: string) => {
    const requestId = ++latestCompileRequestRef.current

    setCompiling(true)
    setCompileError(null)

    try {
      const result = await compileLatexToPdf(nextSource)

      if (requestId !== latestCompileRequestRef.current) {
        return
      }

      setCompileLog(result.log)
      lastCompiledSourceRef.current = nextSource

      if (result.pdf) {
        const nextPdfUrl = URL.createObjectURL(
          new Blob([result.pdf], { type: 'application/pdf' }),
        )

        setPdfUrl((currentPdfUrl) => {
          if (currentPdfUrl) {
            URL.revokeObjectURL(currentPdfUrl)
          }

          return nextPdfUrl
        })
        setLastCompiledAt(Date.now())
        setCompileError(null)
      } else {
        setCompileError(extractLatexError(result.log, result.status))
        setShowLog(true)
      }
    } catch (error) {
      if (requestId !== latestCompileRequestRef.current) {
        return
      }

      setCompileError(
        error instanceof Error ? error.message : 'Failed to compile the LaTeX document.',
      )
      setCompileLog('')
      setShowLog(true)
    } finally {
      if (requestId === latestCompileRequestRef.current) {
        setCompiling(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open || hidden || !autoCompile) {
      return
    }

    if (lastCompiledSourceRef.current === source) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void compileSource(source)
    }, AUTO_COMPILE_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [autoCompile, compileSource, hidden, open, source])

  function onSplitterMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()

    const container = containerRef.current

    if (!container) {
      return
    }

    const { width } = container.getBoundingClientRect()
    const startX = event.clientX
    const startWidth = dragWidthRef.current

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPercent = ((moveEvent.clientX - startX) / width) * 100
      const nextWidth = Math.max(
        MIN_EDITOR_WIDTH,
        Math.min(MAX_EDITOR_WIDTH, startWidth + deltaPercent),
      )

      setEditorWidth(nextWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  if (!open) {
    return null
  }

  if (hidden) {
    return null
  }

  const statusText = getStatusText(compiling, compileError, pdfUrl, hidden)
  const pdfFileName = `${sanitizeFilename(label || 'latex-document')}.pdf`

  const panel = (
    <section className={`latex-workspace-panel${inline ? ' latex-workspace-panel-inline' : ''}`}>
      <header className="latex-workspace-header">
        <div className="latex-workspace-heading">
          <span className="latex-workspace-kicker">{label || 'LaTeX'} workspace</span>
          <strong className="latex-workspace-title">Live PDF preview</strong>
        </div>

        <div className="latex-workspace-actions">
          <button
            className={`latex-workspace-toggle${autoCompile ? ' latex-workspace-toggle-on' : ''}`}
            type="button"
            onClick={() => setAutoCompile((currentValue) => !currentValue)}
          >
            Auto preview
          </button>

          <button
            className="latex-workspace-btn"
            type="button"
            onClick={() => setShowLog((currentValue) => !currentValue)}
          >
            {showLog ? 'Hide log' : 'Show log'}
          </button>

          {pdfUrl ? (
            <a className="latex-workspace-btn" download={pdfFileName} href={pdfUrl}>
              <Download size={14} />
              <span>PDF</span>
            </a>
          ) : null}

          <button
            className="latex-workspace-btn latex-workspace-btn-primary"
            type="button"
            onClick={() => void compileSource(source)}
            disabled={compiling}
          >
            {compiling ? <Loader size={14} className="code-run-spinner" /> : <RotateCcw size={14} />}
            <span>{compiling ? 'Compiling…' : 'Compile'}</span>
          </button>

          <button className="latex-workspace-btn" type="button" onClick={onHide} title="Hide workspace">
            <ChevronRight size={14} />
            <span>Hide</span>
          </button>
        </div>
      </header>

      <div className="latex-workspace-statusbar">
        <span>{statusText}</span>
        {lastCompiledAt ? (
          <span className="latex-workspace-status-meta">
            Last success {new Date(lastCompiledAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>

      <div className="latex-workspace-body" ref={containerRef}>
        <div
          className="latex-workspace-pane latex-workspace-editor-pane"
          style={{ width: `${editorWidth}%` }}
        >
          <div className="latex-workspace-pane-header">
            <span>Source</span>
          </div>

          <textarea
            aria-label="LaTeX source"
            autoCapitalize="off"
            autoCorrect="off"
            className="latex-workspace-editor"
            spellCheck={false}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />

          {showLog ? (
            <section className="latex-workspace-log">
              <div className="latex-workspace-log-header">
                <span>Compilation log</span>
              </div>
              <pre>{compileLog || 'No compilation log yet.'}</pre>
            </section>
          ) : null}
        </div>

        <div
          className="latex-workspace-splitter"
          onMouseDown={onSplitterMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize LaTeX panels"
        >
          <span className="latex-workspace-splitter-handle" />
        </div>

        <div className="latex-workspace-pane latex-workspace-preview-pane">
          <div className="latex-workspace-pane-header">
            <span>PDF preview</span>
          </div>

          <div className="latex-workspace-preview-shell">
            {compileError ? (
              <div className="latex-workspace-banner">
                <strong>Compile issue</strong>
                <pre>{compileError}</pre>
              </div>
            ) : null}

            {pdfUrl ? (
              <iframe
                className="latex-workspace-pdf"
                src={pdfUrl}
                title="LaTeX PDF preview"
              />
            ) : compiling ? (
              <div className="latex-workspace-placeholder">
                <Loader size={16} className="code-run-spinner" />
                <span>Building PDF preview…</span>
              </div>
            ) : (
              <div className="latex-workspace-placeholder">
                <span>Edit the source or run a compile to generate a PDF preview.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )

  return inline ? panel : createPortal(panel, document.body)
}

export { LatexWorkspacePanel }
