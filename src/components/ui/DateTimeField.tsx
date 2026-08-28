import { useState, type RefObject } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { Button } from './Button'
import { CalendarGrid } from './CalendarGrid'
import { PickerDialog } from './PickerDialog'
import { ClockPicker } from './ClockPicker'
import {
  defaultTimeFor,
  formatLocalValue,
  parseLocalValue,
  startOfDay,
  toLocalValue,
  withTime,
} from '../../lib/calendar'
import { cn } from '../../lib/cn'

export interface DateTimeFieldProps {
  id?: string
  /**
   * `YYYY-MM-DDTHH:MM` in the browser's own zone, or `''` for nothing — exactly the contract the
   * native `<input type="datetime-local">` had. Every caller's parsing and validation is unchanged
   * by this component existing.
   */
  value: string
  onChange: (value: string) => void
  /** A floor, same format. Days before it cannot be picked; the exact instant is the caller's check. */
  min?: string
  /** Paints the field as wrong. The message belongs to the caller, which knows why. */
  invalid?: boolean
  className?: string
  /** Shown when there is no value. */
  placeholder?: string
  /** The trigger button, for a caller that has to focus this field — TaskScheduleDialog does. */
  triggerRef?: RefObject<HTMLButtonElement | null>
}

type Step = 'date' | 'time'

/**
 * A date and a time, picked rather than typed.
 *
 * Replaces `<input type="datetime-local">`, which was three different controls depending on who was
 * looking at it: a spinner-and-popup on Chrome, a wheel on iOS, and on Firefox a text field with no
 * calendar at all. None could be styled, none matched the app in either theme, and the keyboard path
 * silently accepted a date with no time — a half-filled field that parses as midnight and saves as a
 * real deadline nobody chose.
 *
 * The value format is identical to the input it replaces, so this is a drop-in: the same strings go
 * in and out, and `localInputToIso` and every `min` comparison keep working.
 *
 * Two steps rather than one screen. A month and a clock face do not fit legibly on a phone at once —
 * crammed together both ended up scrolling, which is how you get a calendar with half its weeks out
 * of view. Picking a day advances to the time on its own, because that is the order anyone does it
 * in, and the tabs go back.
 */
export function DateTimeField({
  id,
  value,
  onChange,
  min,
  invalid = false,
  className,
  placeholder = 'Pick a date and time',
  triggerRef,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('date')
  const parsed = parseLocalValue(value)
  const [month, setMonth] = useState(() => startOfDay(parsed ?? new Date()))

  /*
   * Open on the chosen date's month, and on the date step.
   *
   * Set when the dialog opens rather than watched with an effect: re-homing the month *while* it is
   * open would mean paging to December, tapping the 3rd, and being snapped back to whatever month the
   * value was in before the tap landed.
   */
  const openPicker = () => {
    setMonth(startOfDay(parseLocalValue(value) ?? new Date()))
    setStep('date')
    setOpen(true)
  }

  const time =
    parsed && value.includes('T')
      ? { hour: parsed.getHours(), minute: parsed.getMinutes() }
      : defaultTimeFor(value)

  const pickDay = (day: Date) => {
    onChange(withTime(day, time))
    setMonth(startOfDay(day))
    // Straight on to the time, which is what you came here to set next.
    setStep('time')
  }

  const pickTime = (next: { hour: number; minute: number }) => {
    // Nothing chosen yet: a time on its own is not a value, so today is assumed — which is the month
    // on screen, and one tap from any other day.
    onChange(withTime(parsed ?? new Date(), next))
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2',
          invalid
            ? 'border-[var(--color-danger)] focus-visible:ring-[var(--color-danger)]/20'
            : 'border-[var(--color-border)] focus-visible:border-[var(--color-accent)] focus-visible:ring-[var(--color-accent)]/20',
          open ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-surface-muted)]',
          className,
        )}
      >
        <CalendarDays
          className={cn(
            'h-4 w-4 shrink-0',
            parsed ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]',
          )}
          aria-hidden
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            parsed ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]',
          )}
        >
          {parsed ? formatLocalValue(value) : placeholder}
        </span>
        {/* Clearing is part of the field, not of the dialog: the commonest thing anyone wants from a
          * deadline they can see is to remove it, and that should not need a dialog first. */}
        {parsed ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear"
            title="Clear"
            onClick={(event) => {
              event.stopPropagation()
              onChange('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                onChange('')
              }
            }}
            className="anim-press -mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
      </button>

      <PickerDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Date & time"
        summary={parsed ? formatLocalValue(value) : 'Nothing chosen yet'}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const now = new Date()
                onChange(toLocalValue(now))
                setMonth(startOfDay(now))
              }}
            >
              Now
            </Button>
            <div className="flex items-center gap-1.5">
              {parsed ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  Clear
                </Button>
              ) : null}
              <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </>
        }
      >
        {/* Two tabs rather than a wizard with no way back: picking a day advances on its own, and
          * changing your mind about the day should not mean starting again. */}
        <div className="mb-3 flex rounded-full bg-[var(--color-surface-muted)] p-0.5">
          {(['date', 'time'] as Step[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={step === option}
              onClick={() => setStep(option)}
              className={cn(
                'flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                step === option
                  ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {option === 'date' ? 'Date' : 'Time'}
            </button>
          ))}
        </div>

        {step === 'date' ? (
          <CalendarGrid
            month={month}
            onMonthChange={setMonth}
            selected={parsed}
            onSelect={pickDay}
            min={min}
          />
        ) : (
          <ClockPicker hour={time.hour} minute={time.minute} onChange={pickTime} />
        )}
      </PickerDialog>
    </>
  )
}
