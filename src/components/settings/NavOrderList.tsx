import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { NAV_DESTINATIONS, type NavId } from '../../lib/navOrder'
import { cn } from '../../lib/cn'

export interface NavOrderListProps {
  order: NavId[]
  disabled?: boolean
  /** Awaited, so the list can hold the new arrangement until the save has actually landed. */
  onReorder: (next: NavId[]) => void | Promise<void>
}

function move(order: NavId[], from: number, to: number): NavId[] {
  const next = [...order]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

interface DragState {
  id: NavId
  /** Where the row started, in the committed order. Fixed for the whole drag. */
  startIndex: number
  /** Pointer y when the drag began. */
  startY: number
  /** How far the finger has travelled, or — once released — the distance to the target slot. */
  delta: number
  /** One row plus the gap beneath it, measured once so the maths can't drift mid-drag. */
  slot: number
  /** True between release and commit, while the row glides into its slot. */
  settling: boolean
}

/** How long the released row takes to settle. Matches --motion-base. */
const SETTLE_MS = 180

/**
 * Drag to reorder, with the keyboard as a first-class path rather than an afterthought.
 *
 * Pointer events rather than HTML5 drag-and-drop, which the app's SortableRow uses: that API has no
 * touch implementation, so a `draggable` row is inert on a phone — and this list reorders the
 * phone's own navigation bar.
 *
 * The DOM order never changes while you drag, and that is the whole design. The first version
 * rearranged the list live and then worked out the target by measuring the pointer against the
 * rows it had just moved — so a swap changed what was under your finger and could immediately swap
 * it back. It oscillated, which is why it worked one time in three, and it could not animate,
 * because rows were being re-inserted rather than moved.
 *
 * Instead: everything stays put and rows are displaced with `transform`. The target is derived
 * from how far the pointer has travelled against a slot height measured once at the start, so it
 * cannot feed back on itself. Transforms transition, so the gap opens and closes smoothly, and on
 * release the row glides into place before the real order is committed underneath it — by which
 * point the transformed positions and the committed ones are identical, so nothing jumps.
 */
export function NavOrderList({ order, disabled = false, onReorder }: NavOrderListProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const settleTimer = useRef<number | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  /**
   * The arrangement being saved, shown until the account confirms it.
   *
   * Saving is a round trip, so `order` still holds the old arrangement for as long as it takes.
   * Clearing the drag transforms at that moment dropped the row back where it started and then
   * jumped it into place when the response arrived — the flash that looked like the drop had
   * failed. Rendering this instead spans the gap, and it clears once the save resolves either way:
   * on success `order` already matches it, and on failure reverting is the truth.
   */
  const [pending, setPending] = useState<NavId[] | null>(null)
  const rows = pending ?? order

  const commit = async (next: NavId[]) => {
    setPending(next)
    try {
      await onReorder(next)
    } finally {
      setPending(null)
    }
  }

  useEffect(
    () => () => {
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current)
      }
    },
    [],
  )

  /** Where the dragged row would land, from distance travelled alone. */
  const targetIndex = drag
    ? Math.min(rows.length - 1, Math.max(0, drag.startIndex + Math.round(drag.delta / drag.slot)))
    : -1

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>, index: number, id: NavId) => {
    if (disabled || event.button !== 0 || drag) {
      return
    }
    const items = Array.from(listRef.current?.children ?? []) as HTMLElement[]
    const first = items[0]?.getBoundingClientRect()
    const second = items[1]?.getBoundingClientRect()
    // Row pitch: the gap between two rows' tops. Falls back to one row's height for a list of one,
    // where the value is never used anyway.
    const slot = first && second ? second.top - first.top : (first?.height ?? 1)

    event.currentTarget.setPointerCapture(event.pointerId)
    // Stops the text selection a drag would otherwise start. Focus is then set by hand, because
    // preventDefault on pointerdown also suppresses it — and the grip is the keyboard control.
    event.preventDefault()
    event.currentTarget.focus()
    setDrag({ id, startIndex: index, startY: event.clientY, delta: 0, slot, settling: false })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    setDrag((current) =>
      current && !current.settling
        ? { ...current, delta: event.clientY - current.startY }
        : current,
    )
  }

  const handlePointerUp = () => {
    setDrag((current) => {
      if (!current || current.settling) {
        return current
      }
      const to = Math.min(
        rows.length - 1,
        Math.max(0, current.startIndex + Math.round(current.delta / current.slot)),
      )
      if (to === current.startIndex) {
        return null
      }
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null
        // The row is already sitting in its target slot and its neighbours are already displaced,
        // so swapping to the real arrangement and dropping the transforms in the same commit is
        // visually identical — nothing moves at the moment it becomes real.
        void commit(move(rows, current.startIndex, to))
        setDrag(null)
      }, SETTLE_MS)
      // Snap the row to the exact slot it is about to occupy, so the commit underneath it is
      // invisible rather than a jump.
      return { ...current, delta: (to - current.startIndex) * current.slot, settling: true }
    })
  }

  const nudge = (index: number, direction: -1 | 1) => {
    const to = index + direction
    if (disabled || drag || to < 0 || to >= rows.length) {
      return
    }
    void commit(move(rows, index, to))
  }

  /** How far this row is pushed aside to make room for the one in flight. */
  const displacement = (index: number): number => {
    if (!drag || index === drag.startIndex) {
      return 0
    }
    if (targetIndex > drag.startIndex && index > drag.startIndex && index <= targetIndex) {
      return -drag.slot
    }
    if (targetIndex < drag.startIndex && index < drag.startIndex && index >= targetIndex) {
      return drag.slot
    }
    return 0
  }

  /** The number to show beside a row: where it currently sits, counting the drag in progress. */
  const livePosition = (index: number): number => {
    if (!drag) {
      return index + 1
    }
    if (index === drag.startIndex) {
      return targetIndex + 1
    }
    const shifted = displacement(index)
    return index + (shifted === 0 ? 0 : shifted < 0 ? -1 : 1) + 1
  }

  return (
    <ol ref={listRef} className="mt-2.5 flex flex-col gap-1">
      {rows.map((id, index) => {
        const dragging = drag?.id === id
        const offset = dragging ? drag.delta : displacement(index)
        // The row in flight follows the finger with no transition; the ones getting out of its way
        // always animate, and the flying row animates too once it has been let go.
        const animated = !dragging || drag.settling
        return (
          <li
            key={id}
            style={{
              transform: offset ? `translateY(${offset}px)` : undefined,
              transition: animated ? 'transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
              zIndex: dragging ? 2 : undefined,
              position: dragging ? 'relative' : undefined,
            }}
            className={cn(
              'flex items-center gap-2 rounded-xl border bg-[var(--color-surface)] px-2 py-2',
              'motion-reduce:!transition-none',
              dragging
                ? 'border-[var(--color-accent)] shadow-[var(--shadow-md)]'
                : 'border-[var(--color-border)]',
            )}
          >
            {/*
              * The grip is the drag surface and the keyboard control at once — a button, so it is
              * reachable by Tab and announces itself, and the arrow keys move the row from here.
              * That is what replaces the up/down buttons this list used to carry without leaving
              * keyboard users with a list they can see and not rearrange.
              */}
            <button
              type="button"
              disabled={disabled}
              aria-label={`Reorder ${NAV_DESTINATIONS[id].label}. Position ${index + 1} of ${rows.length}. Use the arrow keys to move it.`}
              onPointerDown={(event) => handlePointerDown(event, index, id)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  nudge(index, -1)
                } else if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  nudge(index, 1)
                }
              }}
              className={cn(
                'inline-flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg',
                'text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25',
                'disabled:pointer-events-none disabled:opacity-40',
                dragging && 'cursor-grabbing text-[var(--color-accent)]',
              )}
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </button>

            <span className="w-4 shrink-0 text-[11px] font-semibold tabular-nums text-[var(--color-text-muted)]">
              {livePosition(index)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text)]">
              {NAV_DESTINATIONS[id].label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
