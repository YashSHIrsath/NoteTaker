import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { Spinner } from './Spinner'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useDialogFocus(open, panelRef)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [loading, onCancel, open])

  if (!open) {
    return null
  }

  /*
   * Portalled to <body>, like every other dialog here.
   *
   * `position: fixed` resolves against the nearest transformed ancestor rather than the viewport,
   * and this is opened from a note card sitting on a grid canvas that positions every card with a
   * transform. So "cover the screen" meant "cover that card": the confirmation rendered as a
   * column squeezed inside one note, which is exactly what it looked like.
   *
   * z-[110] rather than 50 — a confirmation is the last thing asked and belongs above the dialogs
   * that can open it, which sit at 100.
   */
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      /*
       * A portal renders into <body>, but React still routes events up the *component* tree — so a
       * click in here reaches the card this dialog was opened from, and that card's job is to open
       * the note. Hence a note opening behind the dialog the moment you touched anything in it.
       *
       * Stopped at the dialog's own root rather than on each control inside. Escape still works:
       * that listener is on window, which is the DOM tree and unaffected.
       */
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/30"
        onClick={loading ? undefined : onCancel}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[min(90vh,32rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] outline-none"
      >
        <h2 id={titleId} className="text-[15px] font-semibold text-[var(--color-text)]">
          {title}
        </h2>
        <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-muted)]">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? (
              <>
                <Spinner />
                Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
