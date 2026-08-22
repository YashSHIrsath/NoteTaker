import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react'
import type { useCreateBlockNote } from '@blocknote/react'
import { cn } from '../../lib/cn'

export interface BlockActionsMenuProps {
  editor: ReturnType<typeof useCreateBlockNote>
  blockId: string
  top: number
  height: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDragStart: () => void
  onDragEnd: () => void
}

/** Small always-available per-block menu (move up/down, delete) anchored to whichever block
 * the mouse is over. Exists because BlockNote's own hover-triggered side menu has a narrow,
 * unreliable hit zone — this uses the block's full row width as the hover target instead. */
export function BlockActionsMenu({
  editor,
  blockId,
  top,
  height,
  open,
  onOpenChange,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDragEnd,
}: BlockActionsMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  const runAction = (action: () => void) => {
    action()
    onOpenChange(false)
  }

  return (
    <div
      ref={rootRef}
      className="absolute left-2 z-10 flex items-center"
      style={{ top, height }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* A plain draggable div rather than IconButton's <button> — native buttons have their
          own press/click handling that fights the browser's HTML5 drag gesture, so starting a
          real drag from one is unreliable. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Block actions"
        draggable
        className={cn(
          'inline-flex h-6 w-6 shrink-0 cursor-grab select-none items-center justify-center rounded-full',
          'text-[var(--color-text-muted)] transition-colors active:cursor-grabbing',
          'hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        )}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', blockId)
          onDragStart()
        }}
        onDragEnd={onDragEnd}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onOpenChange(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpenChange(!open)
          }
        }}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </div>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute left-full top-0 z-20 ml-1 min-w-[9rem] rounded-lg border border-[var(--color-border)]',
            'bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]',
          )}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
            onClick={() => runAction(() => editor.moveBlocksUp(blockId))}
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            Move up
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
            onClick={() => runAction(() => editor.moveBlocksDown(blockId))}
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            Move down
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-hover)]"
            onClick={() => runAction(() => editor.removeBlocks([blockId]))}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}
