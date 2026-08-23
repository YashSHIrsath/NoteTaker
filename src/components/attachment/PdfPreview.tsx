import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
// The worker ships as its own module; Vite hands back a URL for it rather than inlining it into
// the app bundle.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useFolders } from '../../hooks/useFolders'
import type { Attachment } from '../../types'
import { PreviewStatus } from './SpreadsheetTable'
import { Spinner } from '../ui/Spinner'

/**
 * A PDF, drawn by the app itself.
 *
 * It used to be an <iframe> pointed at the file's signed URL, which asks the platform to render
 * the PDF. Desktop browsers do; an Android WebView has no PDF renderer at all, so on the phone
 * that iframe was simply blank — every PDF in the app was unreadable there, with a line of text
 * underneath suggesting you open it somewhere else. Drawing the pages onto canvases needs nothing
 * from the platform beyond a 2D context, so the same code works in a WebView, a mobile browser
 * and on the desktop.
 *
 * Pages render as they come into view. A phone decoding forty pages at once to show you the first
 * one is a stall and, on a big file, a crash.
 */
export interface PdfPreviewProps {
  attachment: Attachment
}

export function PdfPreview({ attachment }: PdfPreviewProps) {
  const { getAttachmentFile } = useFolders()
  const containerRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<PDFDocumentProxy | null>(null)
  // Teardown hangs off the loading task, not the document: destroying the task is what stops the
  // worker and frees the file, and closing the dialog mid-parse has to do that.
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const [pageNumbers, setPageNumbers] = useState<number[]>([])
  const [aspect, setAspect] = useState(1.414)
  const [width, setWidth] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // The render width, tracked live so a rotation or a window resize redraws at the new size
  // rather than leaving a stretched bitmap.
  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }
    const measure = () => setWidth(node.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const file = await Promise.resolve(getAttachmentFile(attachment.id))
      if (cancelled) {
        return
      }
      if (!file) {
        setError('This file is no longer available.')
        return
      }
      // Imported here rather than at the top of the module: pdf.js is far larger than the rest of
      // the app put together, and most sessions never open a PDF.
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      const data = new Uint8Array(await file.arrayBuffer())
      const task = pdfjs.getDocument({ data })
      taskRef.current = task
      const doc = await task.promise
      if (cancelled) {
        void task.destroy()
        return
      }
      documentRef.current = doc
      // Page one's shape stands in for the rest, so a page that hasn't rendered yet still holds
      // roughly the right amount of space and the scrollbar doesn't jump as you go.
      const first = await doc.getPage(1)
      const viewport = first.getViewport({ scale: 1 })
      if (!cancelled) {
        setAspect(viewport.height / viewport.width)
        setPageNumbers(Array.from({ length: doc.numPages }, (_, index) => index + 1))
      }
    }

    void load().catch(() => {
      if (!cancelled) {
        setError('This PDF could not be opened. Use the download button to save it instead.')
      }
    })

    return () => {
      cancelled = true
      void taskRef.current?.destroy()
      taskRef.current = null
      documentRef.current = null
    }
  }, [attachment.id, getAttachmentFile])

  if (error) {
    return <PreviewStatus>{error}</PreviewStatus>
  }

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3 bg-[var(--color-surface-muted)] p-3">
      {pageNumbers.length === 0 ? (
        <PreviewStatus>
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Opening PDF…
          </span>
        </PreviewStatus>
      ) : (
        pageNumbers.map((pageNumber) => (
          <PdfPage
            key={pageNumber}
            documentRef={documentRef}
            pageNumber={pageNumber}
            width={width}
            aspect={aspect}
          />
        ))
      )}
    </div>
  )
}

function PdfPage({
  documentRef,
  pageNumber,
  width,
  aspect,
}: {
  documentRef: React.RefObject<PDFDocumentProxy | null>
  pageNumber: number
  width: number
  aspect: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) {
      return
    }
    let cancelled = false

    const draw = async () => {
      const doc = documentRef.current
      if (!doc) {
        return
      }
      const page = await doc.getPage(pageNumber)
      if (cancelled) {
        return
      }
      const base = page.getViewport({ scale: 1 })
      // Rendered at the device's own pixel density, then scaled back down by CSS — at scale 1 the
      // text is visibly soft on a phone.
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: ((width - 24) * ratio) / base.width })
      const context = canvas.getContext('2d')
      if (!context) {
        return
      }
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({ canvas, canvasContext: context, viewport }).promise
      if (!cancelled) {
        setRendered(true)
      }
    }

    // Only once it's nearly on screen, with a screenful of warning so scrolling doesn't outrun it.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          void draw().catch(() => undefined)
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(canvas)

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [documentRef, pageNumber, width])

  return (
    <canvas
      ref={canvasRef}
      // The placeholder height keeps the scroll range honest before the page has been drawn.
      style={rendered ? undefined : { height: Math.round((width - 24) * aspect) }}
      className="w-full max-w-full rounded-lg bg-white shadow-[var(--shadow-sm)]"
      aria-label={`Page ${pageNumber}`}
    />
  )
}
