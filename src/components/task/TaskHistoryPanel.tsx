import { AlarmClock, CalendarClock, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TaskEvent, TaskEventKind } from '../../types'
import { useTaskHistory } from '../../hooks/useTaskHistory'
import { Spinner } from '../ui/Spinner'
import { cn } from '../../lib/cn'

/** A stamp people can read at a glance — the date only when it isn't today. */
function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  return date.toLocaleString(undefined, {
    month: sameDay ? undefined : 'short',
    day: sameDay ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const ICONS: Record<TaskEventKind, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  due_set: CalendarClock,
  due_changed: CalendarClock,
  due_cleared: CalendarClock,
  reminder_added: AlarmClock,
  reminder_fired: AlarmClock,
  reminder_removed: Trash2,
  completed: CheckCircle2,
  reopened: RotateCcw,
}

/** Which half of the log an entry belongs to. */
export type HistoryTab = 'all' | 'reminders' | 'due'

function isReminderEvent(kind: TaskEventKind): boolean {
  return kind === 'reminder_added' || kind === 'reminder_fired' || kind === 'reminder_removed'
}

function isDueEvent(kind: TaskEventKind): boolean {
  return (
    kind === 'due_set' ||
    kind === 'due_changed' ||
    kind === 'due_cleared' ||
    kind === 'completed' ||
    kind === 'reopened'
  )
}

/**
 * One entry, said as a sentence.
 *
 * The wording is built here rather than stored, except for `detail` — that is the reminder's own
 * description, captured when the event was written so the line still reads correctly after the
 * reminder has been deleted.
 */
function describeEvent(event: TaskEvent): string {
  switch (event.kind) {
    case 'due_set':
      return `Due date set to ${event.nextAt ? formatMoment(event.nextAt) : '—'}`
    case 'due_changed':
      return `Due date moved from ${event.previousAt ? formatMoment(event.previousAt) : '—'} to ${
        event.nextAt ? formatMoment(event.nextAt) : '—'
      }`
    case 'due_cleared':
      return 'Due date removed'
    case 'reminder_added':
      return `Reminder added — ${event.detail ?? 'reminder'}`
    case 'reminder_fired':
      return `Reminder sent — ${event.detail ?? 'reminder'}`
    case 'reminder_removed':
      return `Reminder deleted — ${event.detail ?? 'reminder'}`
    case 'completed':
      return event.detail === 'completed_late' ? 'Marked done (late)' : 'Marked done (on time)'
    case 'reopened':
      return 'Reopened'
    default:
      return 'Schedule changed'
  }
}

export interface TaskHistoryPanelProps {
  taskId: string
  /** Only fetches while the panel is actually open. */
  open: boolean
  tab: HistoryTab
  onTabChange: (tab: HistoryTab) => void
  /** Bumped by the dialog whenever it does something the log records, since trigger-written rows
   *  never come back through the write that caused them. */
  reloadKey?: number
}

const TABS: Array<{ key: HistoryTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'due', label: 'Due date' },
]

export function TaskHistoryPanel({
  taskId,
  open,
  tab,
  onTabChange,
  reloadKey = 0,
}: TaskHistoryPanelProps) {
  const { events, loading, error } = useTaskHistory(taskId, open, reloadKey)

  const visible = events.filter((event) =>
    tab === 'all' ? true : tab === 'reminders' ? isReminderEvent(event.kind) : isDueEvent(event.kind),
  )

  return (
    <div className="mt-2">
      <div
        role="tablist"
        aria-label="History filter"
        className="flex gap-0.5 rounded-full bg-[var(--color-hover)] p-0.5"
      >
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={tab === entry.key}
            onClick={() => onTabChange(entry.key)}
            className={cn(
              'anim-press min-w-0 flex-1 truncate rounded-full px-2 py-1 text-[11.5px] font-medium transition-colors',
              tab === entry.key
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-3 flex justify-center py-2">
          <Spinner label="Loading history" />
        </div>
      ) : error ? (
        <p className="mt-2 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-[var(--color-text-muted)]">
          Nothing here yet. Deadlines, reminders and completions are recorded as they happen.
        </p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1.5">
          {visible.map((event) => {
            const Icon = ICONS[event.kind]
            return (
              <li key={event.id} className="flex items-start gap-2">
                <Icon
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] leading-snug text-[var(--color-text)]">
                    {describeEvent(event)}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {formatMoment(event.occurredAt)}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
