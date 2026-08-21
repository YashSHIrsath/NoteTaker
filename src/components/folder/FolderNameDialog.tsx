import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
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
        className="absolute inset-0 bg-black/30"
        onClick={submitting ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[min(90vh,32rem)] w-full max-w-sm overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg"
      >
        <h2 id={titleId} className="text-base font-semibold text-[var(--color-text)]">
          {title}
        </h2>
        <form className="mt-4" onSubmit={handleSubmit}>
          <label htmlFor={fieldId} className="block text-sm text-[var(--color-text-muted)]">
            Folder name
          </label>
          <input
            ref={inputRef}
            id={fieldId}
            name="folder-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            autoComplete="off"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" onClick={onClose} disabled={submitting}>
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
