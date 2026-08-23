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
        'anim-item-in relative overflow-hidden rounded-2xl border border-transparent transition-all duration-200 ease-out',
        revealHandleOnHover && 'group',
        hint === 'before' &&
          'before:absolute before:left-3 before:right-3 before:top-0 before:h-[3px] before:rounded-full before:bg-[var(--color-accent)] before:shadow-[0_0_0_1px_rgba(139,133,240,0.2)] before:content-[""]',
        hint === 'after' &&
          'after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-[var(--color-accent)] after:shadow-[0_0_0_1px_rgba(139,133,240,0.2)] after:content-[""]',
        isDragging &&
          'scale-[0.995] border-[var(--color-accent)]/60 bg-[var(--color-accent-soft)] shadow-[0_10px_25px_rgba(0,0,0,0.18)] opacity-80',
        className,
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          'flex w-full items-center py-0.5',
          revealHandleOnHover ? 'gap-0' : 'gap-0.5',
        )}
      >
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
