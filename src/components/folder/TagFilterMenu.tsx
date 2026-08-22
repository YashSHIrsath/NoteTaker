import { useEffect, useRef, useState } from 'react'
import { Check, ListFilter } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface TagFilterMenuProps {
  tags: string[]
  activeTag: string | null
  onSelect: (tag: string | null) => void
}

/** A compact "sort by tag" control — a single icon button that opens a dropdown of tags,
 *  instead of spelling every tag out as its own chip in a permanent row. */
export function TagFilterMenu({ tags, activeTag, onSelect }: TagFilterMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (tags.length === 0) {
    return null
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Sort by tag"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'anim-press inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors sm:h-9',
          activeTag
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
        )}
      >
        <ListFilter className="h-3.5 w-3.5" aria-hidden />
        {activeTag ?? 'Sort by tag'}
      </button>
      {open ? (
        <div
          role="menu"
          // The tag list has no upper bound — a workspace with many tags grew this menu past the
          // bottom of the screen with nothing to scroll, since the page's own scroller sits
          // outside this absolutely-positioned box. Cap it and let it scroll itself.
          className="absolute left-0 z-30 mt-1 max-h-[min(60vh,18rem)] min-w-[10rem] max-w-[14rem] overflow-y-auto overscroll-contain rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(null)
              setOpen(false)
            }}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
          >
            All tags
            {activeTag === null ? <Check className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden /> : null}
          </button>
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(tag === activeTag ? null : tag)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
            >
              <span className="truncate">{tag}</span>
              {activeTag === tag ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
