import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '../ui/Button'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface CreateTaskDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (title: string) => void | Promise<void>
}

export function CreateTaskDialog({
  open,
  onClose,
  onCreate,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const headingId = useId()

  useEffect(() => {
    if (open) {
      setTitle('')
      setSubmitting(false)
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
    const trimmed = title.trim()
    if (!trimmed || submitting) {
      return
    }
    setSubmitting(true)
    void Promise.resolve(onCreate(trimmed))
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
        aria-labelledby={headingId}
        className="relative max-h-[min(90vh,32rem)] w-full max-w-sm overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg"
      >
        <h2 id={headingId} className="text-base font-semibold text-[var(--color-text)]">
          New task
        </h2>
        <form className="mt-4" onSubmit={handleSubmit}>
          <label
            htmlFor="task-title"
            className="block text-sm text-[var(--color-text-muted)]"
          >
            Task title
          </label>
          <input
            ref={inputRef}
            id="task-title"
            name="task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
            autoComplete="off"
            disabled={submitting}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!title.trim() || submitting}>
              {submitting ? 'Creating…' : 'Create Task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
