import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { cn } from '../lib/cn'
import { useMediaQuery } from './useMediaQuery'

export interface PanelSize {
  width: number
  height: number
}

/**
 * The eight grips, and what each one does to the panel.
 *
 * `x` and `y` are the sign a pointer movement is applied with, which is the whole difference
 * between the edges: west and north run backwards, the four corners drive both axes at once, and
 * a zero means that axis is left alone. The edges are inset from the corners so the two never
 * overlap and the corner always wins where they meet.
 */
const RESIZE_HANDLES = [
  { edge: 'n', x: 0, y: -1, className: 'inset-x-4 top-0 h-1.5 cursor-ns-resize' },
  { edge: 's', x: 0, y: 1, className: 'inset-x-4 bottom-0 h-1.5 cursor-ns-resize' },
  { edge: 'w', x: -1, y: 0, className: 'inset-y-4 left-0 w-1.5 cursor-ew-resize' },
  { edge: 'e', x: 1, y: 0, className: 'inset-y-4 right-0 w-1.5 cursor-ew-resize' },
  { edge: 'nw', x: -1, y: -1, className: 'left-0 top-0 h-4 w-4 cursor-nwse-resize' },
  { edge: 'ne', x: 1, y: -1, className: 'right-0 top-0 h-4 w-4 cursor-nesw-resize' },
  { edge: 'sw', x: -1, y: 1, className: 'bottom-0 left-0 h-4 w-4 cursor-nesw-resize' },
  { edge: 'se', x: 1, y: 1, className: 'bottom-0 right-0 h-4 w-4 cursor-nwse-resize' },
] as const

export interface UseResizablePanelOptions {
  /** The panel element being resized — measured on drag start, styled with the result. */
  panelRef: RefObject<HTMLDivElement | null>
  /** localStorage key the dragged size is remembered under. Give each dialog its own. */
  storageKey: string
  minWidth: number
  minHeight: number
  /** The room kept around the panel on each side (it's centred, so both sides count). */
  viewportMargin?: number
}

/**
 * Pointer-driven 8-direction resizing for a centred dialog panel, with the dragged size clamped to
 * the viewport and remembered per device across sessions.
 *
 * Shared between TaskEditorDialog and AttachmentPreviewDialog — the two dialogs that need a panel
 * bigger or smaller than its CSS default — rather than duplicated between them.
 */
export function useResizablePanel({
  panelRef,
  storageKey,
  minWidth,
  minHeight,
  viewportMargin = 32,
}: UseResizablePanelOptions) {
  const clampSize = (size: PanelSize): PanelSize => ({
    width: Math.min(Math.max(size.width, minWidth), Math.max(minWidth, window.innerWidth - viewportMargin)),
    height: Math.min(Math.max(size.height, minHeight), Math.max(minHeight, window.innerHeight - viewportMargin)),
  })

  const readStoredSize = (): PanelSize | null => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        return null
      }
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) {
        return null
      }
      const { width, height } = parsed as Partial<PanelSize>
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return null
      }
      return clampSize({ width: width as number, height: height as number })
    } catch {
      // Unparseable, or unreadable at all — a browser set to block site data throws on the read.
      // The CSS default is a perfectly good answer, so there is nothing here worth recovering.
      return null
    }
  }

  // Resizing, from `sm` up only — below it the dialog is the whole screen, nothing to resize it
  // relative to, and a grip on every edge would be eight strips of screen swallowing a thumb.
  const resizable = useMediaQuery('(min-width: 640px)')
  const [size, setSize] = useState<PanelSize | null>(readStoredSize)
  // Readable from a handler (endResize) that closed over an older render's `size` — it runs at the
  // end of a drag that has moved the size many times since it was registered.
  const sizeRef = useRef(size)
  const dragRef = useRef<
    { x: number; y: number; startX: number; startY: number; width: number; height: number } | null
  >(null)

  useEffect(() => {
    sizeRef.current = size
  }, [size])

  // A window dragged smaller has to take the panel with it, or a dialog sized on an external
  // monitor comes back on the laptop wider than the screen it's centred in.
  useEffect(() => {
    const onWindowResize = () => {
      setSize((current) => {
        if (!current) {
          return current
        }
        const next = clampSize(current)
        return next.width === current.width && next.height === current.height ? current : next
      })
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const beginResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    handle: (typeof RESIZE_HANDLES)[number],
  ) => {
    const panel = panelRef.current
    if (!panel) {
      return
    }
    // Measured, not read from state — the first drag starts from whatever the CSS default worked
    // out to on this screen, and there's no number for that until the panel is on it.
    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      x: handle.x,
      y: handle.y,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
    }
    // Capture, so a fast drag that outruns the strip keeps resizing instead of stopping dead the
    // moment the pointer leaves it.
    event.currentTarget.setPointerCapture(event.pointerId)
    // Stops the drag turning into a text selection across the content behind the grip.
    event.preventDefault()
  }

  const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    // Twice the distance dragged, because the panel is centred: widening it by 10px moves each
    // edge out by 5, and doubling puts the edge back under the pointer.
    setSize(
      clampSize({
        width: drag.width + drag.x * (event.clientX - drag.startX) * 2,
        height: drag.height + drag.y * (event.clientY - drag.startY) * 2,
      }),
    )
  }

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return
    }
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(sizeRef.current))
    } catch {
      // Storage full, or blocked outright. The size still applies for as long as this tab is
      // open, which is the part that was actually asked for; only the memory of it is lost.
    }
  }

  // A dragged size, when there is one, beats the panel's CSS default. Inline rather than a class
  // because the value is a number that came from a pointer, and inline is also what settles the
  // fight with a `max-w-*` utility, which would otherwise cap a deliberately widened panel back
  // down and stop the east grip responding halfway through a drag.
  const panelStyle: { width: string; height: string; maxWidth: string } | undefined =
    resizable && size ? { width: `${size.width}px`, height: `${size.height}px`, maxWidth: 'none' } : undefined

  const resizeHandles = resizable
    ? RESIZE_HANDLES.map((handle) => (
        <div
          key={handle.edge}
          aria-hidden
          onPointerDown={(event) => beginResize(event, handle)}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className={cn('absolute z-20 touch-none select-none', handle.className)}
        >
          {/* One visible corner, on the one people look for — a resize nobody can see is a resize
              nobody finds. Inset 8px so the panel's own corner radius doesn't clip it. */}
          {handle.edge === 'se' ? (
            <span className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 rounded-br-[3px] border-b-2 border-r-2 border-[var(--color-border-strong)] opacity-70" />
          ) : null}
        </div>
      ))
    : null

  return { resizable, size, panelStyle, resizeHandles }
}
