import type { CSSProperties } from 'react'
import { AlarmClock, ArrowRight, CheckCheck, ChevronRight, Timer } from 'lucide-react'
import type { Task } from '../../types'
import { useFolders } from '../../hooks/useFolders'
import { useServerNow } from '../../hooks/useServerNow'
import { countdownLabel, countdownParts, formatDuration } from '../../lib/countdown'
import { formatDueDate } from '../../lib/dueDate'
import { folderPathLabel } from '../../lib/folders'
import { deadlineQueue, deadlineUrgency, type DeadlineUrgency } from '../../lib/taskFilters'
import { cn } from '../../lib/cn'

/**
 * The one deadline that should be on your mind, at the top of the Tree.
 *
 * The Tree page could already tell you how many notes you had and how they were nested, which is
 * a picture of the workspace and not of the *work* — nothing on it answered "what is about to
 * bite me". Everything needed to answer that was already derived (see lib/taskLifecycle); it just
 * had to be sorted and put somewhere you look first.
 *
 * It shows exactly one task, deliberately. A list of everything due is the Tasks page filtered to
 * "Incomplete", and it is not what a person can act on while glancing at a summary. The row of
 * chips underneath is the tail of that queue, present so the single card doesn't read as though
 * it were the only deadline you have.
 */

export interface DeadlineSpotlightProps {
  tasks: Task[]
  /** Opens the task in the editor popup, same as clicking its card anywhere else. */
  onOpenTask: (taskId: string) => void
  className?: string
}

interface UrgencyLook {
  /** Drives the rings, the ink and the breathing shadow — one colour per level. */
  color: string
  soft: string
  eyebrow: string
  /** How often the rings leave the marker. Sooner deadline, faster ping. */
  periodMs: number
  /** Whether the card itself pulses, not just the marker. */
  breathes: boolean
}

const URGENCY: Record<DeadlineUrgency, UrgencyLook> = {
  overdue: {
    color: 'var(--color-danger)',
    soft: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
    eyebrow: 'Overdue — finish this',
    periodMs: 1500,
    breathes: true,
  },
  soon: {
    color: 'var(--task-amber-solid)',
    soft: 'var(--task-amber-card)',
    eyebrow: 'Due today',
    periodMs: 2200,
    breathes: true,
  },
  ahead: {
    color: 'var(--color-accent)',
    soft: 'var(--color-accent-soft)',
    eyebrow: 'Next deadline',
    periodMs: 3200,
    breathes: false,
  },
}

/** "2d 4h" — the chips have room for two units, not three. */
function shortDistance(dueIso: string, nowMs: number): string {
  const parts = countdownParts(new Date(dueIso).getTime(), nowMs)
  const compact = formatDuration(parts).split(' ').slice(0, 2).join(' ')
  return parts.overdue ? `${compact} late` : `in ${compact}`
}

/** Nothing left to chase. Shown rather than hidden: an empty slot where the urgent thing lives
 *  is worth reading, and it is the only place the app ever says you are done. */
function AllClear({ completed, className }: { completed: number; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)] sm:gap-3.5 sm:p-4',
        className,
      )}
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10"
        style={{ background: 'var(--cat-emerald-soft)', color: 'var(--cat-emerald)' }}
        aria-hidden
      >
        <CheckCheck className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-[var(--color-text)] sm:text-[14.5px]">
          No deadlines waiting on you
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-text-muted)] sm:text-[12.5px]">
          {completed > 0
            ? `${completed} due-date ${completed === 1 ? 'task' : 'tasks'} finished. Give a note a deadline to start tracking it.`
            : 'Give a note a deadline with the clock button and it will show up here.'}
        </p>
      </div>
    </div>
  )
}

export function DeadlineSpotlight({ tasks, onOpenTask, className }: DeadlineSpotlightProps) {
  const { folders } = useFolders()
  // The countdown is the point of this component, so it takes the live clock rather than the
  // coarse one the filters use.
  const now = useServerNow(true)
  const queue = deadlineQueue(tasks, now)
  const focus = queue[0]

  if (!focus?.dueAt) {
    const completed = tasks.filter((task) => task.noteKind === 'due_task' && task.completed).length
    return <AllClear completed={completed} className={className} />
  }

  const urgency = deadlineUrgency(focus, now)
  const look = URGENCY[urgency]
  const overdueCount = queue.filter((task) => deadlineUrgency(task, now) === 'overdue').length
  const upNext = queue.slice(1, 4)
  const style = {
    '--radiate-color': look.color,
    '--radiate-period': `${look.periodMs}ms`,
    borderColor: `color-mix(in srgb, ${look.color} 45%, var(--color-border))`,
    background: `linear-gradient(120deg, ${look.soft}, transparent 62%), var(--color-surface)`,
  } as CSSProperties

  return (
    <section
      aria-label="Next deadline"
      className={cn(
        'relative rounded-2xl border shadow-[var(--shadow-sm)]',
        look.breathes && 'anim-breathe',
        className,
      )}
      style={style}
    >
      {/* One button over the whole top half: the entire card is the target, so a thumb doesn't
          have to find the small "Open" chevron on the right. */}
      <button
        type="button"
        onClick={() => onOpenTask(focus.id)}
        className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25 sm:gap-x-4 sm:p-4"
      >
        <span
          className="anim-radiate inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
          style={{ background: look.soft, color: look.color }}
          aria-hidden
        >
          {urgency === 'overdue' ? (
            <AlarmClock className="h-[18px] w-[18px] sm:h-5 sm:w-5" aria-hidden />
          ) : (
            <Timer className="h-[18px] w-[18px] sm:h-5 sm:w-5" aria-hidden />
          )}
        </span>

        <span className="flex min-w-0 flex-1 basis-[11rem] flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="truncate text-[10.5px] font-bold uppercase tracking-[0.08em] sm:text-[11px]"
              style={{ color: look.color }}
            >
              {look.eyebrow}
            </span>
            {overdueCount > 1 ? (
              <span
                className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold"
                style={{ background: look.soft, color: look.color }}
              >
                +{overdueCount - 1} more overdue
              </span>
            ) : null}
          </span>

          <span className="truncate text-[15px] font-semibold leading-tight text-[var(--color-text)] sm:text-[17px]">
            {focus.title.trim() || 'Untitled'}
          </span>

          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[var(--color-text-muted)] sm:text-[12px]">
            <span className="truncate">{formatDueDate(focus.dueAt)}</span>
            <span aria-hidden className="opacity-40">·</span>
            <span className="truncate">{folderPathLabel(folders, focus.folderId)}</span>
          </span>
        </span>

        <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
          <span
            className="whitespace-nowrap text-[13px] font-bold tabular-nums sm:text-[16px]"
            style={{ color: look.color }}
          >
            {countdownLabel(new Date(focus.dueAt).getTime(), now)}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: look.soft, color: look.color }}
          >
            Open
            <ArrowRight className="h-3 w-3" aria-hidden />
          </span>
        </span>
      </button>

      {upNext.length > 0 ? (
        <div className="flex min-w-0 items-center gap-2 border-t border-[var(--color-border)] px-3 py-2 sm:px-4">
          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Up next
          </span>
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {upNext.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task.id)}
                className="anim-press inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: URGENCY[deadlineUrgency(task, now)].color }}
                  aria-hidden
                />
                <span className="max-w-[9rem] truncate">{task.title.trim() || 'Untitled'}</span>
                <span className="shrink-0 tabular-nums opacity-70">
                  {task.dueAt ? shortDistance(task.dueAt, now) : ''}
                </span>
              </button>
            ))}
            {queue.length > 4 ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 px-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                +{queue.length - 4}
                <ChevronRight className="h-3 w-3" aria-hidden />
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
