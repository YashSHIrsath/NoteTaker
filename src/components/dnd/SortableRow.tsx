import type { DragEvent, ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import { useItemDnd, type DropPosition, type ItemDndKind } from '../../context/ItemDndContext'
import { cn } from '../../lib/cn'

const DRAG_TYPE = 'text/plain'

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

function dropPositionFromEvent(
  event: DragEvent<HTMLElement>,
  element: HTMLElement,
): DropPosition {
  const rect = element.getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

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
  const { dragging, dropHint, getDragging, beginDrag, updateDropHint, endDrag, startPointerDrag } =
    useItemDnd()
  const isDragging = dragging?.kind === kind && dragging.itemId === itemId
  const hint =
    dropHint?.kind === kind && dropHint.itemId === itemId ? dropHint.position : null

  const sessionMatchesGroup = (
    session: { kind: ItemDndKind; itemId: string; groupId: string | null } | null,
  ) =>
    session !== null &&
    session.kind === kind &&
    session.itemId !== itemId &&
    session.groupId === groupId

  const handleDragStart = (event: DragEvent<HTMLSpanElement>) => {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_TYPE, itemId)
    beginDrag({ kind, itemId, groupId })
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const session = getDragging()
    if (!sessionMatchesGroup(session)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    updateDropHint({
      kind,
      itemId,
      position: dropPositionFromEvent(event, event.currentTarget),
    })
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const session = getDragging()
    if (!session || !sessionMatchesGroup(session)) {
      endDrag()
      return
    }
    const position = dropPositionFromEvent(event, event.currentTarget)
    onReorder(session.itemId, itemId, position)
    endDrag()
  }

  return (
    <div
      data-dnd-item={itemId}
      data-dnd-kind={kind}
      data-dnd-group={groupId ?? ''}
      className={cn(
        // A row that has just been created (or dropped into a new parent) fades up into place.
        'anim-item-in border-y-2 border-transparent',
        revealHandleOnHover && 'group',
        hint === 'before' && 'border-t-[var(--color-accent)]',
        hint === 'after' && 'border-b-[var(--color-accent)]',
        isDragging && 'rounded-xl bg-[var(--color-hover)] opacity-60 ring-1 ring-[var(--color-accent)]',
        className,
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex w-full items-center gap-0.5">
        <span
          role="button"
          tabIndex={0}
          draggable
          aria-label={dragLabel}
          title={dragLabel}
          onDragStart={handleDragStart}
          onDragEnd={() => endDrag()}
          onPointerDown={(event) =>
            startPointerDrag(event, { kind, itemId, groupId }, { reorder: onReorder })
          }
          className={cn(
            'inline-flex shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-full text-[var(--color-text-muted)]',
            'active:cursor-grabbing',
            compact ? 'h-6 w-5' : 'h-7 w-6',
            // Still occupies its slot when hidden — fading it rather than removing it keeps every
            // row's label on the same left edge whether or not the pointer is over it.
            revealHandleOnHover &&
              'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
            'hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
          )}
        >
          <GripVertical className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden />
        </span>
        {children}
      </div>
    </div>
  )
}
