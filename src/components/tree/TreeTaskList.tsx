import { useState } from 'react'
import { AlarmClock, CheckCircle2, ChevronDown, Clock, FileText, Star } from 'lucide-react'
import type { ComponentType } from 'react'
import type { Task, TaskLifecycle } from '../../types'
import { useFolders } from '../../hooks/useFolders'
import { folderPathLabel } from '../../lib/folders'
import { taskLifecycle } from '../../lib/taskLifecycle'
import { TaskCountdown } from '../task/TaskCountdown'
import { cn } from '../../lib/cn'

export interface TreeTaskListProps {
  /** Already filtered by the page — this list shows what it is handed, in its own priority order. */
  tasks: Task[]
  /** Server time, coarse. Used for ordering and for the state dot, not for the live countdown. */
  nowMs: number
  /** How many rows to show before the "show more" row takes over. */
  limit?: number
  /** Opens the note in the editor popup — the same thing clicking a card does everywhere else. */
  onOpenTask: (taskId: string) => void
  /** What to say when the list is empty, which now usually means the filters emptied it. */
  emptyMessage?: string
}

const DEFAULT_LIMIT = 6

type Glyph = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

/** The state mark's colour and glyph, matching the cards and the filter menu. */
const LIFECYCLE_MARK: Record<TaskLifecycle, { color: string; soft: string; icon: Glyph }> = {
  note: { color: 'var(--color-text-muted)', soft: 'var(--color-surface-muted)', icon: FileText },
  upcoming: { color: 'var(--task-slate-solid)', soft: 'var(--task-slate-card)', icon: Clock },
  overdue: {
    color: 'var(--color-danger)',
    soft: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',
    icon: AlarmClock,
  },
  completed_on_time: {
    color: 'var(--cat-emerald)',
    soft: 'var(--cat-emerald-soft)',
    icon: CheckCircle2,
  },
  completed_late: {
    color: 'var(--task-amber-solid)',
    soft: 'var(--task-amber-card)',
    icon: CheckCircle2,
  },
}

/** Where a row sorts. Lower comes first. */
function priority(lifecycle: TaskLifecycle, task: Task): number {
  if (lifecycle === 'overdue') {
    return 0
  }
  if (lifecycle === 'upcoming') {
    return 1
  }
  return task.isImportant ? 2 : 3
}

/**
 * Urgent work first, then what is coming, then what you starred, then everything else.
 *
 * The old order was starred-first, which is a preference someone set once; a deadline is a fact
 * about right now. Within the two deadline groups the sort is by the deadline itself, so the row
 * at the top of this list is the same task the spotlight above it is pointing at.
 */
function previewOrder(tasks: Task[], nowMs: number): Task[] {
  return [...tasks].sort((a, b) => {
    const rank = priority(taskLifecycle(a, nowMs), a) - priority(taskLifecycle(b, nowMs), b)
    if (rank !== 0) {
      return rank
    }
    if (a.dueAt && b.dueAt) {
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    }
    return 0
  })
}

/** The Tree page's task counterpart to the folder structure below it: a short, ranked peek at the
 *  workspace's notes, with every row saying where it stands. */
export function TreeTaskList({
  tasks,
  nowMs,
  limit = DEFAULT_LIMIT,
  onOpenTask,
  emptyMessage = 'No notes yet.',
}: TreeTaskListProps) {
  const [expanded, setExpanded] = useState(false)
  const { folders } = useFolders()
  const ordered = previewOrder(tasks, nowMs)
  const visible = expanded ? ordered : ordered.slice(0, limit)
  const remaining = ordered.length - visible.length

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)] shadow-[var(--shadow-sm)]">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-sm)] sm:p-2.5">
      <ul className="flex flex-col gap-0.5">
        {visible.map((task) => {
          const lifecycle = taskLifecycle(task, nowMs)
          const mark = LIFECYCLE_MARK[lifecycle]
          const Icon = mark.icon
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpenTask(task.id)}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
                  'hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
                )}
              >
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: mark.soft, color: mark.color }}
                  aria-hidden
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'min-w-0 truncate text-[13.5px] text-[var(--color-text)]',
                        task.isImportant && 'font-semibold',
                      )}
                    >
                      {task.title.trim() || 'Untitled'}
                    </span>
                    {task.isImportant ? (
                      <Star
                        className="h-3 w-3 shrink-0 fill-current text-[var(--cat-rose)]"
                        aria-label="Starred"
                      />
                    ) : null}
                  </span>
                  {/* The countdown and the trail share the second line. The trail is the half
                      that yields on a phone: where a note is filed is the tree's own job, and a
                      deadline is why this row is near the top at all. */}
                  <span className="flex min-w-0 items-center gap-1.5">
                    <TaskCountdown task={task} compact />
                    {lifecycle !== 'note' ? (
                      <span
                        aria-hidden
                        className="hidden text-[10px] text-[var(--color-text-muted)] opacity-40 sm:inline"
                      >
                        ·
                      </span>
                    ) : null}
                    <span className="hidden min-w-0 truncate text-[11px] text-[var(--color-text-muted)] sm:inline">
                      {folderPathLabel(folders, task.folderId)}
                    </span>
                  </span>
                </span>

                {task.tags.length > 0 ? (
                  <span className="hidden shrink-0 gap-1 lg:flex">
                    {task.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="truncate rounded-full bg-[var(--color-hover)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-text-muted)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {/* Expands in place rather than sending you to another page: the whole point of this list
          is that it sits next to the numbers and the tree that explain it. */}
      {remaining > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 inline-flex w-full items-center gap-1 rounded-xl px-2 py-1.5 text-left text-[12.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            aria-hidden
          />
          {expanded ? 'Show less' : `${remaining} more…`}
        </button>
      ) : null}
    </div>
  )
}
