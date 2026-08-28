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
import {
  measureRows,
  offsetForRow,
  reorderArgs,
  settleOffset,
  targetIndexFor,
  type SortableRowMetrics,
} from '../lib/sortable'

/** How long a released row takes to glide into its slot. Matches --motion-base. */
const SETTLE_MS = 180
/** Movement below this is a tap, not a drag — so a grip can still be clicked and focused. */
const DRAG_THRESHOLD = 4

export type ReorderPosition = 'before' | 'after'
export type Reorder = (draggedId: string, targetId: string, position: ReorderPosition) => void

interface Session {
  /** Rows only ever reorder among their own siblings, and this is what "sibling" means. */
  groupKey: string
  id: string
  startIndex: number
  targetIndex: number
  delta: number
  startY: number
  rows: SortableRowMetrics[]
  /** True between release and commit, while the row glides. */
  settling: boolean
  reorder: Reorder
}

interface SortableContextValue {
  register: (groupKey: string, id: string, element: HTMLElement | null) => void
  begin: (
    event: ReactPointerEvent,
    args: { groupKey: string; id: string; reorder: Reorder },
  ) => void
  /** Keyboard equivalent: move this row one place, in one call, with no drag at all. */
  nudge: (args: { groupKey: string; id: string; reorder: Reorder; direction: -1 | 1 }) => void
  /** Pixels this row is currently displaced by. */
  offsetOf: (groupKey: string, id: string) => number
  isDragging: (groupKey: string, id: string) => boolean
  /** True while any row in this group is moving, so siblings can turn their transitions on. */
  isActive: (groupKey: string) => boolean
}

const SortableCtx = createContext<SortableContextValue | null>(null)

/**
 * Drag to reorder, by pointer, for every sortable list in the app that is not a task.
 *
 * One provider rather than one per list, and rows find their own group. Each row registers itself
 * under a group key — for folders, the parent id, since a folder only ever reorders among its
 * siblings — so a list needs no wrapper component and the four places folder rows are rendered
 * (sidebar, tree, root list, folder panel) did not have to change to gain this.
 *
 * Pointer events rather than HTML5 drag-and-drop, which is what this replaces. That API has no touch
 * implementation at all: a `draggable` row is simply inert on a phone, which is where most of this
 * app is used. It also cannot be styled mid-drag beyond a browser-drawn ghost, and it fires
 * dragover against whatever is under the cursor — so the drop target was a property of the DOM
 * rather than of the arithmetic, and nested lists fought each other for it.
 *
 * The mechanism is in lib/sortable, and its one rule is that nothing in the DOM moves during a drag:
 * rows are displaced with transforms against measurements frozen at the start, so the target cannot
 * feed back on the displacement it causes. See that file for what went wrong before.
 */
export function SortableProvider({ children }: { children: ReactNode }) {
  const groups = useRef(new Map<string, Map<string, HTMLElement>>())
  const [session, setSession] = useState<Session | null>(null)
  // The live session, for the pointer handlers: they are attached once per drag and must not close
  // over a snapshot of state that is replaced on every move.
  const live = useRef<Session | null>(null)
  const settleTimer = useRef<number | null>(null)

  const register = useCallback((groupKey: string, id: string, element: HTMLElement | null) => {
    const group = groups.current.get(groupKey) ?? new Map<string, HTMLElement>()
    if (element) {
      group.set(id, element)
      groups.current.set(groupKey, group)
    } else {
      group.delete(id)
      if (group.size === 0) {
        groups.current.delete(groupKey)
      }
    }
  }, [])

  const snapshot = useCallback((groupKey: string): SortableRowMetrics[] => {
    const group = groups.current.get(groupKey)
    if (!group) {
      return []
    }
    return measureRows([...group].map(([id, element]) => ({ id, element })))
  }, [])

  const finish = useCallback((next: Session) => {
    // The commit is deferred until the row has glided into place. By then the transformed position
    // and the position the new order will give it are the same, so applying the order moves nothing
    // — which is the difference between a reorder that lands and one that visibly snaps.
    const args = reorderArgs(next.rows, next.startIndex, next.targetIndex)
    const settled: Session = { ...next, settling: true, delta: settleOffset(next.rows, next.startIndex, next.targetIndex) }
    live.current = settled
    setSession(settled)
    settleTimer.current = window.setTimeout(() => {
      if (args) {
        next.reorder(args.draggedId, args.targetId, args.position)
      }
      live.current = null
      setSession(null)
      settleTimer.current = null
    }, SETTLE_MS)
  }, [])

  const begin = useCallback<SortableContextValue['begin']>(
    (event, { groupKey, id, reorder }) => {
      if (event.button !== 0 && event.pointerType === 'mouse') {
        return
      }
      const rows = snapshot(groupKey)
      const startIndex = rows.findIndex((row) => row.id === id)
      if (startIndex < 0 || rows.length < 2) {
        return
      }
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current)
        settleTimer.current = null
      }

      const target = event.currentTarget as HTMLElement
      target.setPointerCapture(event.pointerId)

      let started = false
      const startY = event.clientY

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientY - startY
        if (!started) {
          if (Math.abs(delta) < DRAG_THRESHOLD) {
            return
          }
          started = true
        }
        // touch-none on the grip keeps the page still; this keeps a text selection from forming as
        // the pointer sweeps across the rows.
        moveEvent.preventDefault()
        const next: Session = {
          groupKey,
          id,
          startIndex,
          targetIndex: targetIndexFor(rows, startIndex, delta),
          delta,
          startY,
          rows,
          settling: false,
          reorder,
        }
        live.current = next
        setSession(next)
      }

      const onUp = () => {
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
        target.removeEventListener('pointercancel', onUp)
        try {
          target.releasePointerCapture(event.pointerId)
        } catch {
          /* Already released — the pointer left the document. */
        }
        const current = live.current
        if (!current || !started) {
          // Never moved far enough to be a drag: leave it as the click it was.
          live.current = null
          setSession(null)
          return
        }
        finish(current)
      }

      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onUp)
    },
    [finish, snapshot],
  )

  const nudge = useCallback<SortableContextValue['nudge']>(
    ({ groupKey, id, reorder, direction }) => {
      const rows = snapshot(groupKey)
      const startIndex = rows.findIndex((row) => row.id === id)
      const targetIndex = startIndex + direction
      if (startIndex < 0 || targetIndex < 0 || targetIndex >= rows.length) {
        return
      }
      // Committed immediately rather than animated: a key press is discrete, and holding an arrow
      // down should step through the list rather than queue up glides.
      const args = reorderArgs(rows, startIndex, targetIndex)
      if (args) {
        reorder(args.draggedId, args.targetId, args.position)
      }
    },
    [snapshot],
  )

  const value = useMemo<SortableContextValue>(
    () => ({
      register,
      begin,
      nudge,
      offsetOf: (groupKey, id) => {
        if (!session || session.groupKey !== groupKey) {
          return 0
        }
        const rowIndex = session.rows.findIndex((row) => row.id === id)
        if (rowIndex < 0) {
          return 0
        }
        if (session.settling) {
          // Only the released row moves during the settle; everything else is already where the
          // committed order will put it.
          return rowIndex === session.startIndex ? session.delta : offsetForRow(session.rows, session.startIndex, session.targetIndex, rowIndex, 0)
        }
        return offsetForRow(session.rows, session.startIndex, session.targetIndex, rowIndex, session.delta)
      },
      isDragging: (groupKey, id) =>
        session !== null && session.groupKey === groupKey && session.id === id,
      isActive: (groupKey) => session !== null && session.groupKey === groupKey,
    }),
    [begin, nudge, register, session],
  )

  return <SortableCtx.Provider value={value}>{children}</SortableCtx.Provider>
}

export function useSortable(): SortableContextValue {
  const value = useContext(SortableCtx)
  if (!value) {
    throw new Error('useSortable must be used inside SortableProvider')
  }
  return value
}

