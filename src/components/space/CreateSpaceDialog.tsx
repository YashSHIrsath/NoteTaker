import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, Users, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Notice } from '../ui/Notice'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { SPACE_COLORS, spaceSwatch } from '../../lib/spaceColor'
import { cn } from '../../lib/cn'
import type { TaskPaletteColor } from '../../types'

export interface CreateSpaceDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, color: TaskPaletteColor) => Promise<unknown>
}

/**
 * Naming a space, and choosing what colour it is.
 *
 * The colour is asked for at creation rather than buried in settings because it is how you will
 * recognise the space later: it tints the whole shell while you are inside one, and the point of
 * that is to make "which workspace am I in" answerable without reading anything.
 */
export function CreateSpaceDialog({ open, onClose, onCreate }: CreateSpaceDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<TaskPaletteColor>('indigo')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const fieldId = useId()

  useEffect(() => {
    if (open) {
      setName('')
      setColor('indigo')
      setSubmitting(false)
      setError(null)
    }
  }, [open])

  useDialogFocus(open, inputRef)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, submitting])

  if (!open) {
    return null
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || submitting) {
      return
    }
    setSubmitting(true)
    setError(null)
    void Promise.resolve(onCreate(trimmed, color))
      .then(() => {
        onClose()
      })
      .catch((caught: unknown) => {
        // Shown here rather than swallowed: the limit on how many spaces an account can own is
        // enforced in the database, so "you have reached the limit of 20 spaces" arrives as a
        // failure and is the only place the person will hear about it.
        setError(caught instanceof Error ? caught.message : 'Could not create the space.')
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return createPortal(
    <div
      /*
       * Portalled to the body, and scrollable from the top rather than centred.
       *
       * Two separate things went wrong here. `fixed inset-0` is only relative to the viewport while
       * no ancestor has a transform — and a page arriving under anim-page-enter has one — so the
       * overlay was being contained by the page content instead of covering the screen. And
       * `items-center` on a dialog taller than the space available overflows it equally above and
       * below, which is what cut the heading off the top rather than scrolling the body.
       *
       * items-start with the container scrolling means the top can never be clipped; sm:items-center
       * still centres it whenever there is room. Same reasoning as the menus, which portal for
       * exactly this reason.
       */
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={submitting ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-dialog-in relative my-auto flex max-h-[min(90vh,34rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        {/* shrink-0, and the body below owns the scrolling.
          *
          * Without it flexbox treats this row as shrinkable and, on a short viewport, squeezes the
          * title and close button to nothing while the form runs off the top of the screen — which
          * is precisely how this dialog appeared with no heading and a clipped first field. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--color-accent-soft)' }}
              aria-hidden
            >
              <Users className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
            </span>
            <h2 id={titleId} className="text-[15px] font-semibold text-[var(--color-text)]">
              New shared space
            </h2>
          </div>
          <IconButton label="Close" onClick={submitting ? undefined : onClose} disabled={submitting}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <form className="min-h-0 flex-1 overflow-y-auto px-4 py-4" onSubmit={handleSubmit}>
          <label htmlFor={fieldId} className="block text-sm font-medium text-[var(--color-text-muted)]">
            Space name
          </label>
          <input
            ref={inputRef}
            id={fieldId}
            name="space-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Q3 Launch"
            className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            autoComplete="off"
          />

          <p className="mt-4 text-sm font-medium text-[var(--color-text-muted)]">Colour</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
            Carried through the whole app while you're in this space, so you always know where you are.
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Space colour">
            {SPACE_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={color === option}
                aria-label={option}
                onClick={() => setColor(option)}
                className={cn(
                  'anim-press inline-flex h-8 w-8 items-center justify-center rounded-full transition-transform',
                  color === option
                    ? 'ring-2 ring-[var(--color-text)] ring-offset-2 ring-offset-[var(--color-surface)]'
                    : 'ring-1 ring-[var(--color-border)]',
                )}
                style={{ background: spaceSwatch(option) }}
              >
                {color === option ? <Check className="h-4 w-4 text-white" aria-hidden /> : null}
              </button>
            ))}
          </div>

          {error ? (
            <div className="mt-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="subtle" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!name.trim() || submitting}>
              {submitting ? 'Creating…' : 'Create space'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
