import { useEffect, useId, useRef } from 'react'
import { Button } from './Button'
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
        className="relative max-h-[min(90vh,32rem)] w-full max-w-sm overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg outline-none"
      >
        <h2 id={titleId} className="text-base font-semibold text-[var(--color-text)]">
          {title}
        </h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-muted)]">
          {description}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
