import { useCallback, type KeyboardEvent, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import { useSortable } from '../../context/SortableContext'
import type { DropPosition, ItemDndKind } from '../../context/ItemDndContext'
import { cn } from '../../lib/cn'

export interface SortableRowProps {
  kind: ItemDndKind
  itemId: string
  groupId: string | null
  compact?: boolean
  className?: string
  /** Keeps the grip out of sight until the row is hovered or something inside it is focused. For
   *  dense, always-on lists (the sidebar) where a permanent column of grip dots is noise; leave it
   *  off where the row is the primary place reordering is done and the affordance should be visible. */
  revealHandleOnHover?: boolean
  dragLabel: string
  onReorder: (draggedId: string, targetId: string, position: DropPosition) => void
  children: ReactNode
}

/**
 * One row of a list you can drag to reorder.
 *
 * Rebuilt on pointer events (see SortableContext), replacing the HTML5 drag-and-drop this used to
 * use. Three things were wrong with that, in rising order of severity: the browser draws its own
 * translucent ghost and nothing can be done about it; a drop target is whatever happens to be under
 * the cursor, so nested folder lists fought each other over dragover; and, fatally, the API has no
 * touch implementation — `draggable` is simply inert on a phone. Every one of these lists is a list
 * people reorder on a phone.
 *
 * What that bought, beyond working: the rows now open a gap and close it as you drag, and the row you
 * release glides into its slot before the real order is applied underneath it, so nothing jumps at
 * the end. And the grip takes arrow keys, which the old one could not — dragging was the only way to
 * reorder anything in the app.
 *
 * The group is the row's parent id: a folder only ever reorders among its siblings, and the provider
 * keys its registry on exactly that. Which is why no list needed a wrapper to gain any of this.
 */
export function SortableRow({
  kind,
  itemId,
  groupId,
  compact = false,
  className,
  revealHandleOnHover = false,
  dragLabel,
  onReorder,
  children,
}: SortableRowProps) {
  const sortable = useSortable()
  // One key per kind and parent, so a folder list and a task list at the same level cannot see each
  // other's rows, and two different parents' children never mix.
  const groupKey = `${kind}:${groupId ?? 'root'}`

  /*
   * `register` is pulled out on its own, and that matters.
   *
   * The context value is rebuilt on every pointer move — it carries the live session — so a ref
   * callback that depended on the whole object would be a new function on every frame of a drag, and
   * React calls a changed ref callback with null before calling it with the element. The row would
   * therefore unregister and re-register itself sixty times a second in the middle of the drag that
   * is reading the registry. `register` itself is stable, so this callback is too.
   */
  const { register } = sortable
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      register(groupKey, itemId, element)
    },
    [groupKey, itemId, register],
  )

  const offset = sortable.offsetOf(groupKey, itemId)
  const dragging = sortable.isDragging(groupKey, itemId)
  const active = sortable.isActive(groupKey)

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (direction === 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    sortable.nudge({ groupKey, id: itemId, reorder: onReorder, direction })
  }

  return (
    <div
      ref={setRef}
      data-dnd-item={itemId}
      data-dnd-kind={kind}
      data-dnd-group={groupId ?? ''}
      className={cn(
        'anim-item-in relative rounded-2xl border border-transparent',
        revealHandleOnHover && 'group',
        /*
         * The dragged row rides above its siblings and is not clipped by them; every other row
         * transitions into its displaced position.
         *
         * The transition is off for the row under the pointer — it has to track the finger exactly,
         * and a 180ms ease on that is lag. It is also off for everyone when no drag is in progress,
         * so a list that re-renders for an unrelated reason does not animate.
         */
        dragging
          ? 'z-20 shadow-[0_12px_30px_rgba(0,0,0,0.22)]'
          : active
            ? 'transition-transform duration-[180ms] ease-out motion-reduce:transition-none'
            : undefined,
        dragging &&
          'border-[var(--color-accent)]/60 bg-[var(--color-accent-soft)] scale-[1.01] cursor-grabbing',
        className,
      )}
      style={{
        transform: offset === 0 ? undefined : `translateY(${offset}px)`,
        // Only while something is moving: `relative` alone is enough at rest, and a permanent
        // stacking context on every folder row is a needless one.
        position: active ? 'relative' : undefined,
      }}
    >
      <div
        className={cn('flex w-full items-center py-0.5', revealHandleOnHover ? 'gap-0' : 'gap-0.5')}
      >
        <span
          role="button"
          tabIndex={0}
          aria-label={`${dragLabel}. Use the up and down arrow keys to move it.`}
          title={dragLabel}
          onPointerDown={(event) => {
            event.stopPropagation()
            sortable.begin(event, { groupKey, id: itemId, reorder: onReorder })
          }}
          onKeyDown={onKeyDown}
          className={cn(
            // touch-none is what makes this work on a phone: without it the browser claims the
            // gesture for scrolling before the first pointermove arrives.
            'inline-flex shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-full border border-transparent bg-transparent text-[var(--color-text-muted)] shadow-none transition-all duration-150',
            'active:cursor-grabbing',
            compact ? 'h-6' : 'h-7',
            revealHandleOnHover
              ? 'w-0 overflow-hidden opacity-0 group-hover:w-5 group-focus-within:w-5 group-hover:opacity-100 group-focus-within:opacity-100 group-hover:shadow-[0_0_0_1px_rgba(0,0,0,0.04)] group-focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.04)] focus-visible:opacity-100'
              : compact
                ? 'w-5'
                : 'w-6',
            'hover:border-[var(--color-border)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.04)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
          )}
        >
          <GripVertical className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
        </span>
        {/* Folder rows supply a label button plus star/menu controls as sibling children. This
            wrapper must itself be a row; a plain block made each sibling start a new line. */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5">{children}</div>
      </div>
    </div>
  )
}
