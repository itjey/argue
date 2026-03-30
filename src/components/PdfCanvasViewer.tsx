import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

function PdfCanvasViewer({ pdfUrl }: { pdfUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvases, setCanvases] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function render() {
      const response = await fetch(pdfUrl)
      const buffer = await response.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

      const pages: string[] = []

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        // Render at 2x for sharpness
        const scale = 2
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof page.render>[0]).promise
        pages.push(canvas.toDataURL('image/png'))
      }

      if (!cancelled) {
        setCanvases(pages)
      }
    }

    render().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [pdfUrl])

  return (
    <div className="pdf-canvas-viewer" ref={containerRef}>
      {canvases.length === 0 ? (
        <div className="pdf-canvas-loading">Rendering…</div>
      ) : (
        canvases.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`Page ${i + 1}`}
            className="pdf-canvas-page"
          />
        ))
      )}
    </div>
  )
}

export { PdfCanvasViewer }
