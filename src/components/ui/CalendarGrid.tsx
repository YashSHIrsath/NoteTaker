import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from './IconButton'
import {
  addMonths,
  isDayBeforeMin,
  monthGrid,
  monthLabel,
  sameDay,
  weekdayLabels,
} from '../../lib/calendar'
import { cn } from '../../lib/cn'

export interface CalendarGridProps {
  /** The month on screen. The caller owns it, so paging does not reset when the value changes. */
  month: Date
  onMonthChange: (month: Date) => void
  /** The chosen day, or null while nothing is chosen. */
  selected: Date | null
  onSelect: (day: Date) => void
  /** A `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` floor. Days before it are unselectable. */
  min?: string
}

/**
 * One month of days.
 *
 * Six rows always, so the panel does not change height as you page — a grid that grows by a row
 * moves every button below it, including the one your pointer is already over.
 *
 * Days outside the month are shown rather than blanked. They are the days either side of a boundary,
 * which is exactly where "next Monday" lives at the end of a month; blanking them makes the first
 * week look broken and forces a page-turn to reach a day two squares away.
 */
export function CalendarGrid({
  month,
  onMonthChange,
  selected,
  onSelect,
  min,
}: CalendarGridProps) {
  const days = monthGrid(month)
  const today = new Date()

  return (
    <div>
      <div className="flex items-center justify-between gap-1 px-0.5">
        <IconButton
          label="Previous month"
          tooltip="Previous"
          box="compact"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        {/* aria-live, because paging with the arrows changes only this: without it a screen reader
          * announces nothing and the grid silently becomes a different month. */}
        <span
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold text-[var(--color-text)]"
        >
          {monthLabel(month)}
        </span>
        <IconButton
          label="Next month"
          tooltip="Next"
          box="compact"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1" aria-hidden>
        {weekdayLabels().map((label, index) => (
          <span
            key={index}
            className="py-1 text-center text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const outside = day.getMonth() !== month.getMonth()
          const isSelected = selected ? sameDay(day, selected) : false
          const isToday = sameDay(day, today)
          const disabled = isDayBeforeMin(day, min)
          return (
            <button
              key={day.getTime()}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onSelect(day)}
              className={cn(
                // 40px tall, from 32. A calendar is tapped with a thumb and read at a glance, and
                // at 32 with a 0.5 gap the month was a dense block of numbers rather than a grid.
                'anim-press relative inline-flex h-10 items-center justify-center rounded-lg text-[13.5px] tabular-nums transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30',
                'disabled:pointer-events-none disabled:opacity-30',
                isSelected
                  ? 'bg-[var(--color-accent)] font-bold text-white'
                  : outside
                    ? 'text-[var(--color-text-muted)]/55 hover:bg-[var(--color-hover)]'
                    : 'font-medium text-[var(--color-text)] hover:bg-[var(--color-hover)]',
              )}
            >
              {day.getDate()}
              {/* A dot rather than a ring or a fill: today is a landmark, not a selection, and the
                * two were indistinguishable when both were a filled circle. */}
              {isToday && !isSelected ? (
                <span
                  aria-hidden
                  className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[var(--color-accent)]"
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
