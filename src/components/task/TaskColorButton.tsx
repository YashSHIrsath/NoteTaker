import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pipette } from 'lucide-react'
import type { TaskColor, TaskPaletteColor } from '../../types'
import { TASK_PALETTE, isCustomColor, paletteSwatch } from '../../lib/taskColor'
import { cn } from '../../lib/cn'

export interface TaskColorButtonProps {
  /** CSS color the card is using right now — the picked one, or the view's fallback. */
  activeColor: string
  /** Null when the task has no explicit choice and is following its view's own rule. */
  selected: TaskColor | null
  onSelect: (color: TaskColor | null) => void
  compact?: boolean
}

const DEFAULT_CUSTOM = '#7c8cf8'
const PANEL_WIDTH = 208
const VIEWPORT_MARGIN = 8

/** Borders on every swatch: a pale color (or one close to the surface) is otherwise a floating
 *  smudge with no edge, in either theme. */
const SWATCH_BORDER = 'border border-black/15 dark:border-white/25'

/** The task's card color — the swatch shows it, clicking it opens the palette and a custom picker. */
export function TaskColorButton({ activeColor, selected, onSelect, compact = false }: TaskColorButtonProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // The panel is portaled to the body because a card clips its own overflow — anchored inside it,
  // the palette was cut off at the card's edge. Fixed coordinates, measured from the swatch.
  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const place = () => {
      const anchor = buttonRef.current?.getBoundingClientRect()
      if (!anchor) {
        return
      }
      const panelHeight = panelRef.current?.offsetHeight ?? 0
      // Right-aligned to the swatch, then pulled back inside the viewport rather than allowed to
      // run off the edge — the swatch sits near the right edge of a card by design.
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, anchor.right - PANEL_WIDTH),
        window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN,
      )
      // Below the swatch, unless that would run past the bottom — then above it.
      const below = anchor.bottom + 6
      const flip = panelHeight > 0 && below + panelHeight > window.innerHeight - VIEWPORT_MARGIN
      setPosition({ top: flip ? Math.max(VIEWPORT_MARGIN, anchor.top - panelHeight - 6) : below, left })
    }
    place()
    window.addEventListener('resize', place)
    // Capture phase: the card scrolls inside its own container, not the window.
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
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

  const custom = selected && isCustomColor(selected) ? selected : null

  const choose = (color: TaskColor | null) => {
    onSelect(color)
    setOpen(false)
  }

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Card color"
        aria-expanded={open}
        onClick={(event) => {
          // The whole card is a button — a click here is only ever about the color.
          event.preventDefault()
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        onPointerDown={stop}
        className={cn(
          'anim-press inline-flex shrink-0 items-center justify-center rounded-full',
          SWATCH_BORDER,
          compact ? 'h-4 w-4' : 'h-[18px] w-[18px]',
        )}
        style={{ background: activeColor }}
      />

      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label="Card color"
              onPointerDown={stop}
              onClick={stop}
              className="anim-dialog-in fixed z-50 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-[var(--shadow-lg)]"
              style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
            >
              <div className="grid grid-cols-6 gap-1.5">
                {TASK_PALETTE.map((color: TaskPaletteColor) => (
                  <button
                    key={color}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected === color}
                    aria-label={color}
                    title={color}
                    onClick={() => choose(color)}
                    className={cn(
                      'anim-press inline-flex h-6 w-6 items-center justify-center rounded-full',
                      SWATCH_BORDER,
                    )}
                    style={{ background: paletteSwatch(color) }}
                  >
                    {selected === color ? <Check className="h-3.5 w-3.5 text-white" aria-hidden /> : null}
                  </button>
                ))}
              </div>

              <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--color-border)] pt-2.5">
                {/* Any color, via the platform's own picker: a real <input type="color"> opens the
                    OS picker (eyedropper included) and commits as you drag. */}
                <label
                  className="anim-press relative inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2 py-1 text-[11.5px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-hover)]"
                  title="Custom color"
                >
                  <span
                    className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full', SWATCH_BORDER)}
                    style={
                      custom
                        ? { background: custom }
                        : {
                            background:
                              'conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #38bdf8, #a78bfa, #f472b6, #f87171)',
                          }
                    }
                    aria-hidden
                  >
                    {custom ? null : <Pipette className="h-2.5 w-2.5 text-white drop-shadow" aria-hidden />}
                  </span>
                  <span className="truncate">{custom ? custom.toUpperCase() : 'Custom'}</span>
                  <input
                    type="color"
                    aria-label="Custom color"
                    value={custom ?? DEFAULT_CUSTOM}
                    onChange={(event) => onSelect(event.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>

                {/* Clearing the choice isn't the same as picking today's color: it hands the
                    decision back to the view, so the card keeps following its folder (or the
                    scatter) later. */}
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected === null}
                  onClick={() => choose(null)}
                  className={cn(
                    'anim-press shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                    selected === null
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                  )}
                >
                  Auto
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
