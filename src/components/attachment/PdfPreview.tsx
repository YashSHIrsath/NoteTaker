import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Maximize2, MoveHorizontal, ZoomIn, ZoomOut } from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
// The worker ships as its own module; Vite hands back a URL for it rather than inlining it into
// the app bundle.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useFolders } from '../../hooks/useFolders'
import type { Attachment } from '../../types'
import { PreviewStatus } from './SpreadsheetTable'
import { Spinner } from '../ui/Spinner'
import { IconButton } from '../ui/IconButton'

/**
 * A PDF, drawn by the app itself.
 *
 * It used to be an <iframe> pointed at the file's signed URL, which asks the platform to render
 * the PDF. Desktop browsers do; an Android WebView has no PDF renderer at all, so on the phone
 * that iframe was simply blank. Drawing the pages onto canvases needs nothing from the platform
 * beyond a 2D context, so the same code works in a WebView, a mobile browser and on the desktop.
 *
 * The layout is the part that has to be right. Every page is laid out from its own measured size
 * at the current scale, before anything is drawn, and that box never changes afterwards — drawing
 * only fills in a box the scroll range already accounted for. The previous version sized every
 * placeholder from page one's shape and then dropped the placeholder height once a page had
 * drawn, so any page that was not page-one-shaped resized under the reader. On a phone, where a
 * lazy render lands a screenful behind your thumb, that pulled what you were reading off screen
 * and dropped you somewhere else in the document — the pages "flipping" on their own. Nothing
 * here resizes on render, and the two things that legitimately change the layout (zooming, and a
 * page's real size arriving) re-anchor the scroll so the page you are on stays where it is.
 *
 * A whole page also fits in the window now. Pages were drawn at the full width of the dialog,
 * which on a desktop makes an A4 page half again as tall as the space it sits in: there was no
 * scroll position from which you could see one complete page.
 */
export interface PdfPreviewProps {
  attachment: Attachment
}

interface PageSize {
  width: number
  height: number
}

interface PageBox extends PageSize {
  /** Distance from the top of the scrolled content, so page positions are known without the DOM. */
  top: number
}

/** Padding around the page column, and the space between pages. These are in the scroll maths as
 *  well as in the styles, so they are numbers rather than utility classes that could drift apart. */
const GUTTER = 12
const GAP = 12

/** Zoom, relative to whichever fit the reader picked; 1 is that fit exactly. */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3]
const FIT_ZOOM_INDEX = 2

/** iOS caps a canvas at 4096 to a side, and hands back a blank one past that rather than failing. */
const MAX_CANVAS_SIDE = 4096

type FitMode = 'page' | 'width'

export function PdfPreview({ attachment }: PdfPreviewProps) {
  const { getAttachmentFile } = useFolders()
  const scrollRef = useRef<HTMLDivElement>(null)
  // Teardown hangs off the loading task, not the document: destroying the task is what stops the
  // worker and frees the file, and closing the dialog mid-parse has to do that.
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<PageSize[]>([])
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [fit, setFit] = useState<FitMode>('page')
  const [zoomIndex, setZoomIndex] = useState(FIT_ZOOM_INDEX)
  const [pageIndex, setPageIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // The space a page has to fit into, tracked live so a rotation or a resize lays out again at
  // the new size rather than leaving a stretched bitmap.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) {
      return
    }
    const measure = () => setBox({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Zoom is relative to a fit, and the fit is measured from page one so that the scale is the
  // same for every page — a document should not change size halfway through, which is what a
  // per-page fit would do to the odd landscape page in the middle of a report.
  const scale = useMemo(() => {
    const first = sizes[0]
    if (!first || box.width === 0) {
      return 0
    }
    const availableWidth = Math.max(box.width - GUTTER * 2, 120)
    const availableHeight = Math.max(box.height - GUTTER * 2, 160)
    const widthScale = availableWidth / first.width
    const base = fit === 'width' ? widthScale : Math.min(widthScale, availableHeight / first.height)
    return base * ZOOM_STEPS[zoomIndex]
  }, [sizes, box.width, box.height, fit, zoomIndex])

  const layout = useMemo<PageBox[]>(() => {
    const boxes: PageBox[] = []
    let top = GUTTER
    for (const size of sizes) {
      const width = Math.round(size.width * scale)
      const height = Math.round(size.height * scale)
      boxes.push({ width, height, top })
      top += height + GAP
    }
    return boxes
  }, [sizes, scale])

  // The scroll maths reads the layout from a ref: it runs from event handlers and from the
  // loading effect, neither of which should be re-created every time a page is measured. It
  // tracks the *committed* layout, which is the one the scroll offsets it works in belong to.
  const layoutRef = useRef(layout)
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  const pageAt = useCallback((offset: number) => {
    const boxes = layoutRef.current
    let index = 0
    for (let i = 0; i < boxes.length; i += 1) {
      if (boxes[i].top <= offset) {
        index = i
      } else {
        break
      }
    }
    return index
  }, [])

  /**
   * Where the reader is, in page-relative terms, so it survives a change of layout.
   *
   * Zooming, rotating, and a page's real size arriving all move every page below them. Holding
   * the scroll position in pixels would slide the document under the reader; holding it as "this
   * far into page seven" keeps page seven where it was, which is the only thing that reads as
   * staying put.
   */
  const anchorRef = useRef<{ index: number; offset: number } | null>(null)

  const captureAnchor = useCallback(() => {
    const node = scrollRef.current
    const boxes = layoutRef.current
    if (!node || boxes.length === 0) {
      return
    }
    const index = pageAt(node.scrollTop)
    const page = boxes[index]
    anchorRef.current = { index, offset: (node.scrollTop - page.top) / Math.max(page.height, 1) }
  }, [pageAt])

  // Before the browser paints the new layout, not after: restoring in a plain effect would show
  // one frame at the wrong offset, which is the jump this exists to prevent.
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) {
      return
    }
    anchorRef.current = null
    const node = scrollRef.current
    const page = layout[anchor.index]
    if (node && page) {
      node.scrollTop = Math.max(page.top + anchor.offset * page.height, 0)
    }
  }, [layout])

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
      const loaded = await task.promise
      if (cancelled) {
        void task.destroy()
        return
      }
      const first = await loaded.getPage(1)
      if (cancelled) {
        return
      }
      const firstSize = sizeOf(first.getViewport({ scale: 1 }))
      // Page one's shape stands in for the rest so the document is on screen straight away; the
      // real sizes follow below. Measuring every page up front would be correct too, but it holds
      // a long document behind a spinner for something most documents don't need.
      setSizes(Array.from({ length: loaded.numPages }, () => firstSize))
      setDoc(loaded)

      for (let number = 2; number <= loaded.numPages; number += 1) {
        const page = await loaded.getPage(number)
        if (cancelled) {
          return
        }
        const size = sizeOf(page.getViewport({ scale: 1 }))
        if (size.width === firstSize.width && size.height === firstSize.height) {
          continue
        }
        captureAnchor()
        setSizes((previous) => {
          const next = previous.slice()
          next[number - 1] = size
          return next
        })
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
      setDoc(null)
      setSizes([])
    }
  }, [attachment.id, getAttachmentFile, captureAnchor])

  const onScroll = useCallback(() => {
    const node = scrollRef.current
    if (!node) {
      return
    }
    setPageIndex(pageAt(node.scrollTop + node.clientHeight / 2))
  }, [pageAt])

  const goToPage = useCallback((index: number) => {
    const node = scrollRef.current
    const page = layoutRef.current[index]
    if (!node || !page) {
      return
    }
    node.scrollTo({ top: Math.max(page.top - GUTTER, 0), behavior: 'smooth' })
    setPageIndex(index)
  }, [])

  const changeZoom = (next: number) => {
    captureAnchor()
    setZoomIndex(next)
  }

  const toggleFit = () => {
    captureAnchor()
    setFit((previous) => (previous === 'page' ? 'width' : 'page'))
    setZoomIndex(FIT_ZOOM_INDEX)
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <PreviewStatus>{error}</PreviewStatus>
      </div>
    )
  }

  const ready = doc !== null && layout.length > 0 && scale > 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-surface-muted)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
        <div className="flex min-w-0 items-center gap-0.5">
          <IconButton
            label="Previous page"
            disabled={!ready || pageIndex === 0}
            onClick={() => goToPage(pageIndex - 1)}
          >
            <ChevronUp className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Next page"
            disabled={!ready || pageIndex >= layout.length - 1}
            onClick={() => goToPage(pageIndex + 1)}
          >
            <ChevronDown className="h-4 w-4" />
          </IconButton>
          <span className="ml-1 whitespace-nowrap text-xs tabular-nums text-[var(--color-text-muted)]">
            {ready ? `${pageIndex + 1} / ${layout.length}` : '—'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Zoom out" disabled={!ready || zoomIndex === 0} onClick={() => changeZoom(zoomIndex - 1)}>
            <ZoomOut className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Zoom in"
            disabled={!ready || zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() => changeZoom(zoomIndex + 1)}
          >
            <ZoomIn className="h-4 w-4" />
          </IconButton>
          <IconButton label={fit === 'page' ? 'Fit to width' : 'Fit whole page'} disabled={!ready} onClick={toggleFit}>
            {fit === 'page' ? <MoveHorizontal className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {ready ? (
          <div className="flex flex-col items-center" style={{ padding: GUTTER, gap: GAP }}>
            {layout.map((page, index) => (
              <PdfPage key={index} doc={doc} pageNumber={index + 1} width={page.width} height={page.height} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <PreviewStatus>
              <span className="inline-flex items-center gap-2">
                <Spinner />
                Opening PDF…
              </span>
            </PreviewStatus>
          </div>
        )}
      </div>
    </div>
  )
}

function sizeOf(viewport: { width: number; height: number }): PageSize {
  return { width: viewport.width, height: viewport.height }
}

/**
 * One page, drawn into a box that is already the right size.
 *
 * Pages draw when they come within a screen or so of view, and release their bitmap once they are
 * well past it. A phone decoding a whole document at once is a stall on a small file and a crash
 * on a large one: at a 2x pixel ratio a single A4 page is around 12MB of canvas, so a forty-page
 * document held open would be half a gigabyte of it.
 */
function PdfPage({
  doc,
  pageNumber,
  width,
  height,
}: {
  doc: PDFDocumentProxy
  pageNumber: number
  width: number
  height: number
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const node = wrapperRef.current
    if (!node) {
      return
    }
    // The pause before letting a page go: a flick that overshoots and comes straight back should
    // find the page still drawn rather than blank.
    let release: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries[entries.length - 1]?.isIntersecting ?? false
        if (visible) {
          clearTimeout(release)
          setNear(true)
        } else {
          release = setTimeout(() => {
            // Sizing a canvas to nothing is what actually frees the bitmap; dropping the element
            // alone would leave the memory to the garbage collector's own schedule, which on a
            // phone is well after the point where it mattered.
            const canvas = canvasRef.current
            if (canvas) {
              canvas.width = 0
              canvas.height = 0
            }
            setDrawn(false)
            setNear(false)
          }, 2000)
        }
      },
      { rootMargin: '900px 0px' },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      clearTimeout(release)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !near || width === 0 || height === 0) {
      return
    }
    let cancelled = false
    let task: RenderTask | null = null

    const draw = async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) {
        return
      }
      const base = page.getViewport({ scale: 1 })
      // Drawn at the device's own pixel density and scaled back down by CSS — at a flat scale of
      // 1 the text is visibly soft on a phone — but never past what a canvas can actually hold.
      const density = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.min(width * density, MAX_CANVAS_SIDE, (MAX_CANVAS_SIDE * width) / height)
      const viewport = page.getViewport({ scale: pixelWidth / base.width })
      const context = canvas.getContext('2d')
      if (!context) {
        return
      }
      canvas.width = Math.max(Math.floor(viewport.width), 1)
      canvas.height = Math.max(Math.floor(viewport.height), 1)
      task = page.render({ canvas, canvasContext: context, viewport })
      await task.promise
      if (!cancelled) {
        setDrawn(true)
      }
    }

    // Anything thrown here is either a cancelled render — expected, on every zoom and resize — or
    // a page pdf.js could not draw. Neither should take the whole document down.
    void draw().catch(() => undefined)

    return () => {
      cancelled = true
      // Cancelling matters for more than the work saved: pdf.js refuses a second render onto a
      // canvas that is still being drawn, so a zoom part-way through a render used to leave the
      // page half painted until it was scrolled away and back.
      //
      // The bitmap is deliberately left where it is. A zoom re-runs this effect, and clearing
      // here would blank every visible page for the length of the redraw; keeping the old one up
      // lets CSS scale it into the new box until the sharp one lands.
      task?.cancel()
    }
  }, [doc, pageNumber, width, height, near])

  return (
    <div
      ref={wrapperRef}
      style={{ width, height }}
      className="relative shrink-0 overflow-hidden rounded-lg bg-white shadow-[var(--shadow-sm)]"
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`Page ${pageNumber}`} />
      {drawn ? null : (
        <span className="absolute inset-x-0 bottom-2 text-center text-[11px] text-neutral-400" aria-hidden>
          {pageNumber}
        </span>
      )}
    </div>
  )
}
