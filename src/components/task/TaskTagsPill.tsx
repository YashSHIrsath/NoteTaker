import { createPortal } from 'react-dom'
import { Hash } from 'lucide-react'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import { cn } from '../../lib/cn'

export interface TaskTagsPillProps {
  tags: string[]
  /** The tile's text colour, so the pill tints with the card instead of fighting it. */
  ink: string
}

const PANEL_WIDTH = 196

/**
 * The note's tags, folded into a pill in the tile header.
 *
 * Listing them under the title made every tile a different height above its divider, and cost the
 * preview a row of space on cards that mostly have one tag. As a pill it's a fixed-size marker of
 * "this note is tagged", and the tags themselves are one tap away.
 */
export function TaskTagsPill({ tags, ink }: TaskTagsPillProps) {
  const { open, setOpen, anchorRef, panelRef, position } = useAnchoredPanel<HTMLButtonElement>(PANEL_WIDTH)

  if (tags.length === 0) {
    return null
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-label={`${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}`}
        title={tags.join(', ')}
        onClick={(event) => {
          // The whole tile is a button; this click is only ever about the tags.
          event.preventDefault()
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          'anim-press inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-full pl-1 pr-1.5 text-[10.5px] font-bold leading-none transition-transform',
          open && 'scale-105',
        )}
        style={{ color: ink, background: `color-mix(in srgb, ${ink} 16%, transparent)` }}
      >
        <Hash className="h-2.5 w-2.5" aria-hidden />
        {tags.length}
      </button>

      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Tags"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className="anim-panel-in fixed z-50 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-[var(--shadow-lg)]"
              style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
            >
              <p className="px-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Tags
              </p>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag, index) => (
                  <span
                    key={tag}
                    // Each chip arrives just after the one before it, so the list reads as opening
                    // rather than appearing all at once.
                    className="anim-item-in inline-flex max-w-full items-center gap-0.5 rounded-full bg-[var(--color-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text)]"
                    style={{ animationDelay: `${index * 35}ms` }}
                  >
                    <span className="text-[var(--color-text-muted)]">#</span>
                    <span className="min-w-0 truncate">{tag}</span>
                  </span>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
