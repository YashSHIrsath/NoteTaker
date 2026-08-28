import { useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from './Button'
import { PickerDialog } from './PickerDialog'
import { ClockPicker } from './ClockPicker'
import { formatTimeValue, parseTimeValue } from '../../lib/calendar'
import { cn } from '../../lib/cn'

export interface TimeFieldProps {
  id?: string
  /** `HH:MM`, 24-hour — the format the `time` column stores and the native input spoke. */
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * A time of day, picked rather than typed.
 *
 * Replaces `<input type="time">`, which had the same problem its datetime sibling did: unstyleable,
 * different on every platform, and on a desktop keyboard a pair of spinners nobody can hit. The clock
 * face is the same one the date-and-time field shows, so a recurring reminder's "At 09:00" and a
 * deadline's time are chosen with the identical control.
 *
 * The value is always 24-hour, whatever the locale displays — that is what the column stores.
 */
export function TimeField({ id, value, onChange, className }: TimeFieldProps) {
  const [open, setOpen] = useState(false)
  const parsed = parseTimeValue(value)
  // A blank or malformed value still has to render a grid with something highlighted, and nine in the
  // morning is what the recurring reminders already default to.
  const time = parsed ?? { hour: 9, minute: 0 }

  const pick = (next: { hour: number; minute: number }) => {
    onChange(`${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}`)
  }

  return (
    <>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm transition-colors',
          'focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
          open ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-surface-muted)]',
          className,
        )}
      >
        <Clock
          className={cn(
            'h-4 w-4 shrink-0',
            parsed ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]',
          )}
          aria-hidden
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate tabular-nums',
            parsed ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]',
          )}
        >
          {parsed ? formatTimeValue(value) : 'Pick a time'}
        </span>
      </button>

      <PickerDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Time"
        summary={parsed ? formatTimeValue(value) : 'Nothing chosen yet'}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // To the minute, not rounded to five: the dial can express any of them now.
                const now = new Date()
                pick({ hour: now.getHours(), minute: now.getMinutes() })
              }}
            >
              Now
            </Button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <ClockPicker hour={time.hour} minute={time.minute} onChange={pick} />
      </PickerDialog>
    </>
  )
}
