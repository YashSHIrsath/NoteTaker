import { AlarmClock, CheckCircle2, Circle, Clock } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TaskLifecycle } from '../../types'
import { LIFECYCLE_LABELS } from '../../lib/taskLifecycle'
import { cn } from '../../lib/cn'
import { useToggleFeedback } from '../../hooks/useToggleFeedback'

/**
 * A due-date task's state, and the one control that changes it.
 *
 * This used to cycle Incomplete -> Ongoing -> Complete, with the state stored as whatever was last
 * clicked. It couldn't answer "was this finished on time", because nothing recorded when the click
 * happened — so the badge is now a readout of four states derived from the deadline and the
 * completion time, driven by a plain tick. Overdue and late aren't clickable states; they're what
 * the clock says about the ones that are.
 */
const LIFECYCLE_ICON: Record<TaskLifecycle, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  note: Circle,
  upcoming: Circle,
  completed_on_time: CheckCircle2,
  completed_late: CheckCircle2,
  overdue: AlarmClock,
  // `note` and `upcoming` share the empty circle: an unticked box is an unticked box, and the
  // urgency lives in the countdown next to it rather than in a second icon.
}

const LIFECYCLE_STYLES: Record<TaskLifecycle, string> = {
  note: 'border-[var(--color-border)] bg-[var(--color-hover)] text-[var(--color-text-muted)]',
  upcoming: 'border-[var(--color-border)] bg-[var(--color-hover)] text-[var(--color-text-muted)]',
  completed_on_time: 'border-[var(--cat-emerald)]/30 bg-[var(--cat-emerald-soft)] text-[var(--cat-emerald-ink)]',
  overdue: 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  completed_late: 'border-[var(--task-amber-solid)]/35 bg-[var(--task-amber-card)] text-[var(--task-amber-ink)]',
}

export interface TaskStatusBadgeProps {
  lifecycle: TaskLifecycle
  completed: boolean
  /** Ticks or unticks. The lifecycle that results is derived, never passed back in. */
  onToggle: () => void
  compact?: boolean
  /** Just the symbol — for the note header, where the label is redundant next to the icon. */
  iconOnly?: boolean
}

export function TaskStatusBadge({
  lifecycle,
  completed,
  onToggle,
  compact = false,
  iconOnly = false,
}: TaskStatusBadgeProps) {
  const Icon = LIFECYCLE_ICON[lifecycle]
  const popping = useToggleFeedback(lifecycle)
  const label = LIFECYCLE_LABELS[lifecycle]

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-pressed={completed}
      aria-label={`${label}. ${completed ? 'Mark as not done' : 'Mark as done'}.`}
      title={`${label} — click to mark ${completed ? 'not done' : 'done'}`}
      className={cn(
        'anim-press inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors hover:brightness-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        iconOnly
          // 22px, the same box as the colour swatch and the actions menu it shares a capsule with —
          // see TaskCardControls, whose halves are 24px, so this sits inside with a pixel either side
          // rather than filling it to the edge.
          ? 'h-[22px] w-[22px] justify-center'
          : compact
            ? 'px-2 py-0.5 text-[11px]'
            : 'px-2.5 py-1 text-[12.5px]',
        LIFECYCLE_STYLES[lifecycle],
      )}
    >
      <Icon
        className={cn(iconOnly || compact ? 'h-3 w-3' : 'h-3.5 w-3.5', popping && 'anim-pop')}
        aria-hidden
      />
      {iconOnly ? null : label}
    </button>
  )
}

/** The bell a card shows when a note has reminders on it. Not a control — the count is the point,
 *  and the reminders themselves are edited in the schedule dialog. */
export function ReminderCountPill({
  count,
  compact = false,
  hint,
}: {
  count: number
  compact?: boolean
  /** When the next one goes out. Carried here now that the clock button it used to live on is gone
   *  — the count says there are reminders, this says when to expect one. */
  hint?: string
}) {
  if (count <= 0) {
    return null
  }
  const label = `${count} reminder${count === 1 ? '' : 's'}`
  return (
    <span
      title={hint ? `${label} — ${hint}` : label}
      aria-label={hint ? `${label}, ${hint}` : label}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--color-hover)] font-medium text-[var(--color-text-muted)]',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
      )}
    >
      <AlarmClock className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} aria-hidden />
      {count}
    </span>
  )
}

/** Exported for the countdown line, which uses the same clock glyph as the "not due yet" badge. */
export const CountdownIcon = Clock
