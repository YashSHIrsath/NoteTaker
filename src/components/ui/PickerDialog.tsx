import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { cn } from '../../lib/cn'

export interface PickerDialogProps {
  open: boolean
  onClose: () => void
  title: string
  /** The value as it currently stands, read back above the controls. Omitted where the body already
   *  says it — a grid of options that each show their own state has nothing to summarise. */
  summary?: string
  children: ReactNode
  /** The row along the bottom — Now, Clear, Done. */
  footer: ReactNode
  /**
   * 'sm' is a picker: one control, sized to it. 'lg' is a settings screen lifted off a page.
   *
   * The second exists so that a long list of options does not have to live inline. A settings card
   * that is three screens tall makes every other setting under it unreachable without scrolling past
   * choices you have already made — the page becomes a corridor. In here the same list is a scroll of
   * its own, and the page keeps a one-line summary.
   */
  size?: 'sm' | 'lg'
}

/**
 * The shell centred dialogs live in — the date and time pickers, and the font picker.
 *
 * They were anchored popovers, which was the wrong shape for the job. A panel hung off its field has
 * only the room that happens to be left beside it, and these fields sit inside dialogs — so a
 * calendar opened two-thirds of the way down one had 240px to fit six weeks, a pair of time columns
 * and a footer into. It scrolled, which meant choosing a date required scrolling a calendar inside a
 * panel inside a dialog, with half the month out of view.
 *
 * Centred, the size stops depending on where the field is. Nothing scrolls except on a genuinely
 * short screen, and the whole month is visible at once, which is the only way a calendar is any use.
 *
 * Centred on a phone as well, unlike the dialogs it opens over.
 *
 * Those are bottom sheets on purpose — they are opened from a card and their controls should be
 * where a thumb is — and they sit clear of the bottom bar, about 76px up. A picker anchored to the
 * bottom too, but with only its own 12px of padding, therefore landed 64px *below* the sheet that
 * opened it: a second sheet, lower than the first, poking out underneath it and hugging the very
 * bottom of the screen. Two bottom-anchored surfaces at two different offsets read as one of them
 * being crooked. A picker is a dialog over a dialog, so it goes in the middle.
 *
 * z-[120] clears the app's whole stacking ladder — 50 a dialog, 60 a menu over one, 100 a dialog
 * opened from a dialog, 110 the last word. A picker is opened from any of those.
 */
export function PickerDialog({
  open,
  onClose,
  title,
  summary,
  children,
  footer,
  size = 'sm',
}: PickerDialogProps) {
  useEffect(() => {
    if (!open) {
      return
    }
    /*
     * Escape, in the capture phase, and swallowed.
     *
     * Capture because a dialog that portals to the body stops propagation at its own root, so a
     * bubble-phase listener here would never run. Swallowed because the dialog underneath is
     * listening for Escape too — without this, one press closed the picker *and* the Schedule dialog
     * behind it, losing the edit.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, open])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4"
      /* A portal renders into <body>, but React still routes events up the component tree — so a
         click in here would reach the card this was ultimately opened from, whose job is to open the
         note. Stopped at the root rather than on every control inside. */
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Close"
        className="anim-overlay-in absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          // The cap is the padding above, doubled — 1.5rem for p-3, 2rem for sm:p-4. Stated per
          // breakpoint because one number for both let the dialog grow 8px past its own gutter
          // on a wide screen, which is where a centred surface starts touching an edge.
          'anim-dialog-in relative flex w-full flex-col overflow-hidden',
          'max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]',
          'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]',
          size === 'lg' ? 'max-w-3xl' : 'max-w-[22rem]',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {title}
            </p>
            {/* The value read back, live. A calendar with a highlighted square does not tell you what
              * you have actually chosen once a time is involved — this does, and it is the thing
              * Done commits. */}
            {summary ? (
              <p className="truncate text-[15px] font-semibold text-[var(--color-text)]">{summary}</p>
            ) : null}
          </div>
          <IconButton label="Close" box="compact" onClick={onClose} className="-mr-1 shrink-0">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--color-border)] px-3 py-2.5">
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  )
}
