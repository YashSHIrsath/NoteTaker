import { AlertTriangle, Check, Clock } from 'lucide-react'
import type { Task } from '../../types'
import { countdownLabel } from '../../lib/countdown'
import { taskLifecycle } from '../../lib/taskLifecycle'
import { useServerNow } from '../../hooks/useServerNow'
import { cn } from '../../lib/cn'

export interface TaskCountdownProps {
  task: Task
  compact?: boolean
  className?: string
}

/**
 * "2d 4h 31m remaining", counting down live; then "Due now"; then "Overdue by 2h 15m".
 *
 * The clock it counts against is the server's (see lib/serverClock), not the device's, and the
 * state it reports is derived from columns the server wrote — so this is a display of a fact, not
 * a fact of its own. A task that expires while this is on screen crosses into "Overdue" on the
 * next tick without a reload, and one that expired while the browser was shut is already overdue
 * on the first paint, because nothing about the state depended on the page having been open.
 */
export function TaskCountdown({ task, compact = false, className }: TaskCountdownProps) {
  // A plain note has nothing to count, and opting out here is what keeps most cards off the
  // shared ticker entirely.
  const isTracked = task.noteKind === 'due_task' && task.dueAt !== null
  const now = useServerNow(isTracked && !task.completed)

  if (!isTracked || !task.dueAt) {
    return null
  }

  const lifecycle = taskLifecycle(task, now)
  const size = compact ? 'text-[10.5px]' : 'text-[11.5px]'
  const icon = compact ? 'h-3 w-3' : 'h-3.5 w-3.5'

  if (lifecycle === 'completed_on_time' || lifecycle === 'completed_late') {
    return (
      <span
        className={cn('inline-flex min-w-0 items-center gap-1 font-medium', size, className)}
        style={{
          color:
            lifecycle === 'completed_on_time' ? 'var(--cat-emerald-ink)' : 'var(--task-amber-ink)',
        }}
      >
        <Check className={cn(icon, 'shrink-0')} aria-hidden />
        <span className="truncate">
          {lifecycle === 'completed_on_time' ? 'Completed on time' : 'Completed late'}
        </span>
      </span>
    )
  }

  const overdue = lifecycle === 'overdue'
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 font-medium tabular-nums',
        size,
        overdue ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]',
        className,
      )}
    >
      {overdue ? (
        <AlertTriangle className={cn(icon, 'shrink-0')} aria-hidden />
      ) : (
        <Clock className={cn(icon, 'shrink-0')} aria-hidden />
      )}
      <span className="truncate">{countdownLabel(new Date(task.dueAt).getTime(), now)}</span>
    </span>
  )
}
