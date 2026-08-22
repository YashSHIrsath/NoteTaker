import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CalendarClock, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface TaskDueDateDialogProps {
  open: boolean
  dueAt: string | null
  remindBeforeMinutes: number | null
  onClose: () => void
  onSave: (dueAt: string | null, remindBeforeMinutes: number | null) => void
}

const REMINDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'At the due time' },
  { value: '15', label: '15 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '180', label: '3 hours before' },
  { value: '1440', label: '1 day before' },
  { value: '2880', label: '2 days before' },
  { value: '10080', label: '1 week before' },
]

function toLocalInputValue(iso: string | null): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInputValue(value: string): string | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

export function TaskDueDateDialog({
  open,
  dueAt,
  remindBeforeMinutes,
  onClose,
  onSave,
}: TaskDueDateDialogProps) {
  const [localValue, setLocalValue] = useState(() => toLocalInputValue(dueAt))
  const [reminder, setReminder] = useState(remindBeforeMinutes === null ? '' : String(remindBeforeMinutes))
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const fieldId = useId()
  const reminderId = useId()

  useEffect(() => {
    if (open) {
      setLocalValue(toLocalInputValue(dueAt))
      setReminder(remindBeforeMinutes === null ? '' : String(remindBeforeMinutes))
    }
  }, [open, dueAt, remindBeforeMinutes])

  useDialogFocus(open, inputRef)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextDueAt = fromLocalInputValue(localValue)
    onSave(nextDueAt, nextDueAt ? (reminder === '' ? null : Number(reminder)) : null)
    onClose()
  }

  const handleClear = () => {
    onSave(null, null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--color-accent-soft)' }}
              aria-hidden
            >
              <CalendarClock className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
            </span>
            <h2 id={titleId} className="text-[15px] font-semibold text-[var(--color-text)]">
              Due date &amp; reminder
            </h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <form className="px-4 py-4" onSubmit={handleSubmit}>
          <label htmlFor={fieldId} className="block text-sm font-medium text-[var(--color-text-muted)]">
            Due date
          </label>
          <input
            ref={inputRef}
            id={fieldId}
            type="datetime-local"
            value={localValue}
            onChange={(event) => setLocalValue(event.target.value)}
            className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />

          <label htmlFor={reminderId} className="mt-4 block text-sm font-medium text-[var(--color-text-muted)]">
            Email reminder
          </label>
          <select
            id={reminderId}
            value={reminder}
            onChange={(event) => setReminder(event.target.value)}
            disabled={!localValue}
            className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20 disabled:opacity-50"
          >
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="mt-5 flex items-center justify-between gap-2">
            {dueAt ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                Remove due date
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="subtle" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!localValue}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
