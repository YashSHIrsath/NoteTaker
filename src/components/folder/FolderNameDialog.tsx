import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Folder, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface FolderNameDialogProps {
  open: boolean
  title: string
  confirmLabel?: string
  busyLabel?: string
  initialName?: string
  onClose: () => void
  onSubmit: (name: string) => void | Promise<unknown>
}

export function FolderNameDialog({
  open,
  title,
  confirmLabel = 'Save',
  busyLabel = 'Saving…',
  initialName = '',
  onClose,
  onSubmit,
}: FolderNameDialogProps) {
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const fieldId = useId()

  useEffect(() => {
    if (open) {
      setName(initialName)
      setSubmitting(false)
    }
  }, [initialName, open])

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
    void Promise.resolve(onSubmit(trimmed))
      .then(() => {
        onClose()
      })
      .catch(() => {
        /* persistError banner explains the failure */
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
        className="anim-dialog-in relative flex max-h-[min(90vh,32rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--color-accent-soft)' }}
              aria-hidden
            >
              <Folder className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
            </span>
            <h2 id={titleId} className="text-[15px] font-semibold text-[var(--color-text)]">
              {title}
            </h2>
          </div>
          <IconButton label="Close" onClick={submitting ? undefined : onClose} disabled={submitting}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <form className="overflow-y-auto px-4 py-4" onSubmit={handleSubmit}>
          <label htmlFor={fieldId} className="block text-sm font-medium text-[var(--color-text-muted)]">
            Folder name
          </label>
          <input
            ref={inputRef}
            id={fieldId}
            name="folder-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            autoComplete="off"
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="subtle" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!name.trim() || submitting}>
              {submitting ? busyLabel : confirmLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
