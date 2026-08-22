import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

export type ItemDndKind = 'folder' | 'task'
export type DropPosition = 'before' | 'after'

export interface ItemDragSession {
  kind: ItemDndKind
  itemId: string
  groupId: string | null
}

export interface ItemDropHint {
  kind: ItemDndKind
  itemId: string
  position: DropPosition
}

/** What a touch drag should do when it lands. Registered per drag, so the commit stays with the
 *  component that owns the operation instead of moving into this context. */
export interface ItemDragHandlers {
  reorder?: (draggedId: string, targetId: string, position: DropPosition) => void
  /** Only meaningful for kinds that can move between groups (a task into another board column). */
  moveToZone?: (zoneId: string) => void
}

export interface PointerDragOptions {
  /**
   * Delay before the drag takes over the gesture. 0 for a dedicated grip handle (nothing else
   * competes for it); a hold for an element that is also tappable and sits in a scroll area, so
   * a tap still taps and a swipe still scrolls.
   */
  holdMs?: number
}

interface ItemDndContextValue {
  dragging: ItemDragSession | null
  dropHint: ItemDropHint | null
  /** Group/zone currently under a touch drag — board columns highlight off this. */
  dropZoneId: string | null
  getDragging: () => ItemDragSession | null
  beginDrag: (session: ItemDragSession) => void
  updateDropHint: (hint: ItemDropHint | null) => void
  endDrag: () => void
  /**
   * Touch/pen dragging. HTML5 drag-and-drop (`draggable` + dragstart/dragover/drop) is only
   * synthesized for mouse input, so on a phone — and in DevTools' touch emulation — none of those
   * events ever fire and dragging silently does nothing. This runs the same operations off
   * pointer events instead. Mouse pointers are ignored here so they keep the native path.
   */
  startPointerDrag: (
    event: ReactPointerEvent<HTMLElement>,
    session: ItemDragSession,
    handlers: ItemDragHandlers,
    options?: PointerDragOptions,
  ) => void
  /** True while a touch drag is live — for suppressing the tap that would follow it. */
  isPointerDragging: () => boolean
}

const ItemDndContext = createContext<ItemDndContextValue | null>(null)

/** Distance that cancels a pending hold: the gesture was a scroll, not a drag. */
const HOLD_CANCEL_PX = 10
/** Edge band that auto-scrolls the surrounding list while dragging. */
const EDGE_PX = 56
const EDGE_STEP_PX = 12

function findScrollableAncestor(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null
  while (current) {
    const style = window.getComputedStyle(current)
    const scrolls = /(auto|scroll|overlay)/.test(style.overflowY)
    if (scrolls && current.scrollHeight > current.clientHeight + 1) {
      return current
    }
    current = current.parentElement
  }
  return null
}

export function ItemDndProvider({ children }: { children: ReactNode }) {
  const draggingRef = useRef<ItemDragSession | null>(null)
  const [dragging, setDragging] = useState<ItemDragSession | null>(null)
  const [dropHint, setDropHint] = useState<ItemDropHint | null>(null)
  const [dropZoneId, setDropZoneId] = useState<string | null>(null)
  // Committing happens in a pointerup listener, which can't read React state — the refs are the
  // source of truth for the drop decision, the state is only what the UI renders.
  const dropHintRef = useRef<ItemDropHint | null>(null)
  const dropZoneRef = useRef<string | null>(null)
  const pointerDraggingRef = useRef(false)

  const getDragging = useCallback(() => draggingRef.current, [])

  const beginDrag = useCallback((session: ItemDragSession) => {
    draggingRef.current = session
    setDragging(session)
  }, [])

  const updateDropHint = useCallback((hint: ItemDropHint | null) => {
    dropHintRef.current = hint
    setDropHint(hint)
  }, [])

  const updateDropZone = useCallback((zoneId: string | null) => {
    dropZoneRef.current = zoneId
    setDropZoneId(zoneId)
  }, [])

  const endDrag = useCallback(() => {
    draggingRef.current = null
    dropHintRef.current = null
    dropZoneRef.current = null
    setDragging(null)
    setDropHint(null)
    setDropZoneId(null)
  }, [])

  const isPointerDragging = useCallback(() => pointerDraggingRef.current, [])

  const startPointerDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      session: ItemDragSession,
      handlers: ItemDragHandlers,
      options?: PointerDragOptions,
    ) => {
      // Mouse keeps using the browser's own drag-and-drop, which brings the drag image, the
      // cursor and the file-drop interop with it.
      if (event.pointerType === 'mouse' || event.button !== 0) {
        return
      }

      const handle = event.currentTarget
      const pointerId = event.pointerId
      const startX = event.clientX
      const startY = event.clientY
      const holdMs = options?.holdMs ?? 0
      const scroller = findScrollableAncestor(handle)

      let started = false
      let holdTimer: number | null = null

      const resolveTargetAt = (x: number, y: number) => {
        const element = document.elementFromPoint(x, y)
        const row = element?.closest<HTMLElement>('[data-dnd-item]')
        if (
          row &&
          row.dataset.dndKind === session.kind &&
          (row.dataset.dndGroup ?? '') === (session.groupId ?? '') &&
          row.dataset.dndItem !== session.itemId
        ) {
          const rect = row.getBoundingClientRect()
          updateDropZone(null)
          updateDropHint({
            kind: session.kind,
            itemId: row.dataset.dndItem!,
            position: y < rect.top + rect.height / 2 ? 'before' : 'after',
          })
          return
        }

        // No row under the finger — a whole-group target (board column) is the fallback.
        const zone = element?.closest<HTMLElement>('[data-dnd-zone]')
        if (zone && handlers.moveToZone) {
          updateDropHint(null)
          updateDropZone(zone.dataset.dndZone ?? null)
          return
        }

        updateDropHint(null)
        updateDropZone(null)
      }

      const autoScroll = (y: number) => {
        if (!scroller) {
          return
        }
        const rect = scroller.getBoundingClientRect()
        if (y < rect.top + EDGE_PX) {
          scroller.scrollTop -= EDGE_STEP_PX
        } else if (y > rect.bottom - EDGE_PX) {
          scroller.scrollTop += EDGE_STEP_PX
        }
      }

      const begin = () => {
        started = true
        pointerDraggingRef.current = true
        beginDrag(session)
        document.body.classList.add('dnd-touch-active')
        // A short buzz is the only "you picked it up" signal a finger gets — there's no cursor
        // and no drag image on touch.
        navigator.vibrate?.(8)
      }

      // touch-action alone doesn't stop a scroll that a hold turns into a drag mid-gesture.
      const blockScroll = (moveEvent: TouchEvent) => {
        if (started) {
          moveEvent.preventDefault()
        }
      }

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return
        }
        if (!started) {
          if (holdMs > 0) {
            const moved = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY)
            if (moved > HOLD_CANCEL_PX) {
              cleanup()
            }
            return
          }
          begin()
        }
        resolveTargetAt(moveEvent.clientX, moveEvent.clientY)
        autoScroll(moveEvent.clientY)
      }

      const commit = () => {
        const hint = dropHintRef.current
        const zone = dropZoneRef.current
        if (hint && handlers.reorder) {
          handlers.reorder(session.itemId, hint.itemId, hint.position)
        } else if (zone && zone !== session.groupId) {
          handlers.moveToZone?.(zone)
        }
      }

      const cleanup = (didDrop = false) => {
        if (holdTimer !== null) {
          window.clearTimeout(holdTimer)
          holdTimer = null
        }
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerCancel)
        window.removeEventListener('touchmove', blockScroll)
        document.body.classList.remove('dnd-touch-active')
        if (handle.hasPointerCapture?.(pointerId)) {
          handle.releasePointerCapture(pointerId)
        }
        if (started) {
          if (didDrop) {
            commit()
          }
          endDrag()
          // Cleared a frame later so the click that follows a touch release can still see that a
          // drag just happened and skip itself.
          window.setTimeout(() => {
            pointerDraggingRef.current = false
          }, 0)
        }
        started = false
      }

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return
        }
        cleanup(true)
      }

      const onPointerCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== pointerId) {
          return
        }
        cleanup(false)
      }

      handle.setPointerCapture?.(pointerId)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerCancel)
      window.addEventListener('touchmove', blockScroll, { passive: false })

      if (holdMs > 0) {
        holdTimer = window.setTimeout(begin, holdMs)
      } else {
        begin()
      }
    },
    [beginDrag, endDrag, updateDropHint, updateDropZone],
  )

  const value = useMemo(
    () => ({
      dragging,
      dropHint,
      dropZoneId,
      getDragging,
      beginDrag,
      updateDropHint,
      endDrag,
      startPointerDrag,
      isPointerDragging,
    }),
    [
      dragging,
      dropHint,
      dropZoneId,
      getDragging,
      beginDrag,
      updateDropHint,
      endDrag,
      startPointerDrag,
      isPointerDragging,
    ],
  )

  return <ItemDndContext.Provider value={value}>{children}</ItemDndContext.Provider>
}

export function useItemDnd(): ItemDndContextValue {
  const context = useContext(ItemDndContext)
  if (!context) {
    throw new Error('useItemDnd must be used within an ItemDndProvider')
  }
  return context
}
