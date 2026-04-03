import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, FolderDown, ImagePlus, Loader, RotateCcw, X } from 'lucide-react'
import { compileLatexToPdf } from '../lib/swiftlatex'
import { PdfCanvasViewer } from './PdfCanvasViewer'
import { WriteAiSidebar } from './WriteAiSidebar'

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

function LatexWorkspacePanel({
  hidden = false,
  initialSource,
  inline = false,
  label,
  onHide,
  open,
}: LatexWorkspacePanelProps) {
  const [source, setSource] = useState(initialSource)
  const [editorWidth, setEditorWidth] = useState(36)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [compileLog, setCompileLog] = useState('')
  const [compileError, setCompileError] = useState<string | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [autoCompile, setAutoCompile] = useState(true)
  const [showLog, setShowLog] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragWidthRef = useRef(editorWidth)
  const lastCompiledSourceRef = useRef<string | null>(null)
  const latestCompileRequestRef = useRef(0)
  const previousInitialSourceRef = useRef(initialSource)

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const name = file.name.replace(/\.[^.]+$/, '')
      const snippet = `\\includegraphics[width=\\textwidth]{${file.name}} % uploaded: ${name}`
      setSource((prev) => prev.replace('\\end{document}', `${snippet}\n\\end{document}`))
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleDownloadZip() {
    const blob = new Blob([source], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${sanitizeFilename(label || 'document')}.tex`
    a.click()
    URL.revokeObjectURL(a.href)
  }

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

    setDragging(true)

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      const deltaPercent = ((moveEvent.clientX - startX) / width) * 100
      const nextWidth = Math.max(
        MIN_EDITOR_WIDTH,
        Math.min(MAX_EDITOR_WIDTH, startWidth + deltaPercent),
      )

      setEditorWidth(nextWidth)
    }

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', cleanup)
      document.removeEventListener('mouseleave', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDragging(false)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', cleanup)
    document.addEventListener('mouseleave', cleanup)
  }

  if (!open) {
    return null
  }

  if (hidden) {
    return null
  }

  const pdfFileName = `${sanitizeFilename(label || 'latex-document')}.pdf`

  const tabActionsTarget = document.getElementById('workspace-tab-actions')

  const panel = (
    <section className={`latex-workspace-panel${inline ? ' latex-workspace-panel-inline' : ''}`}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

      {tabActionsTarget && createPortal(
        <>
          <button
            className="latex-workspace-icon-btn"
            type="button"
            onClick={() => void compileSource(source)}
            disabled={compiling}
            title="Compile"
          >
            {compiling ? <Loader size={15} className="code-run-spinner" /> : <RotateCcw size={15} />}
          </button>
          <button
            className="latex-workspace-icon-btn"
            type="button"
            onClick={() => imageInputRef.current?.click()}
            title="Upload image"
          >
            <ImagePlus size={15} />
          </button>
          {pdfUrl ? (
            <a className="latex-workspace-icon-btn" download={pdfFileName} href={pdfUrl} title="Download PDF">
              <Download size={15} />
            </a>
          ) : null}
          <button
            className="latex-workspace-icon-btn"
            type="button"
            onClick={handleDownloadZip}
            title="Download .tex source"
          >
            <FolderDown size={15} />
          </button>
        </>,
        tabActionsTarget
      )}

      <div className="latex-workspace-body" ref={containerRef}>
        {dragging && <div className="latex-workspace-drag-overlay" />}
        <div
          className="latex-workspace-pane latex-workspace-editor-pane"
          style={{ width: `${editorWidth}%` }}
        >
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
          <div className="latex-workspace-preview-shell">
            {compileError ? (
              <div className="latex-workspace-banner">
                <strong>Compile issue</strong>
                <pre>{compileError}</pre>
              </div>
            ) : null}

            {pdfUrl ? (
              <PdfCanvasViewer pdfUrl={pdfUrl} />
            ) : compiling ? (
              <div className="latex-workspace-placeholder">
                <Loader size={16} className="code-run-spinner" />
                <span>Building PDF preview…</span>
              </div>
            ) : (
              <div className="latex-workspace-placeholder">
                <span>Edit the source to generate a PDF preview.</span>
              </div>
            )}
          </div>
        </div>

        <button
          className="ai-sidebar-toggle"
          type="button"
          onClick={() => setAiOpen((v) => !v)}
          title={aiOpen ? 'Collapse AI panel' : 'Expand AI panel'}
        >
          {aiOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {aiOpen && (
          <WriteAiSidebar
            source={source}
            onApplyEdit={(newSource) => setSource(newSource)}
          />
        )}
      </div>
    </section>
  )

  return inline ? panel : createPortal(panel, document.body)
}

export { LatexWorkspacePanel }
