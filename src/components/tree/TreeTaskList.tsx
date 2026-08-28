import { useState } from 'react'
import { AlarmClock, CheckCircle2, ChevronDown, ChevronRight, Clock, FileText, Star } from 'lucide-react'
import type { ComponentType } from 'react'
import type { Task, TaskLifecycle } from '../../types'
import { useFolders } from '../../hooks/useFolders'
import { folderPathLabel } from '../../lib/folders'
import { categoryVar, getRootCategoryForFolder } from '../../lib/folderColor'
import { taskLifecycle } from '../../lib/taskLifecycle'
import { contentSnippet } from '../../lib/blockNoteContent'
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
/** Memoised across renders: this parses a JSON document per row, and the list re-renders on every
 *  tick of the clock the countdowns run on. Keyed by the content itself, so an edit invalidates it. */
const snippetCache = new Map<string, string>()

function snippet(task: Task): string {
  const cached = snippetCache.get(task.content)
  if (cached !== undefined) {
    return cached
  }
  const value = contentSnippet(task.content, 120)
  // A note is edited far more often than the cache is worth growing for.
  if (snippetCache.size > 300) {
    snippetCache.clear()
  }
  snippetCache.set(task.content, value)
  return value
}

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
      {/* Flush rows with hairlines between them, rather than floating rows with gaps: at two lines
        *  each the gaps stopped reading as separation and the whole list ran together as one block.
        *  The rule is inset to where the text starts, so it divides the writing and leaves the
        *  column of discs unbroken — which is what keeps it a list of notes rather than a table. */}
      <ul className="flex flex-col">
        {visible.map((task, index) => {
          const lifecycle = taskLifecycle(task, nowMs)
          const base = LIFECYCLE_MARK[lifecycle]
          // A note has no state to report, so its disc says where it lives instead — the same
          // colour its folder carries everywhere else in the app.
          const category = getRootCategoryForFolder(folders, task.folderId)
          const mark =
            lifecycle === 'note'
              ? { ...base, color: categoryVar(category, 'ink'), soft: categoryVar(category, 'soft') }
              : base
          const Icon = mark.icon
          return (
            <li
              key={task.id}
              className={cn(
                'group relative',
                index > 0 &&
                  'before:pointer-events-none before:absolute before:inset-x-0 before:left-[3.25rem] before:top-0 before:h-px before:bg-[var(--color-border)]',
              )}
            >
              <button
                type="button"
                onClick={() => onOpenTask(task.id)}
                className={cn(
                  'flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors',
                  'hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
                )}
              >
                {/*
                  * The disc carries the row's colour, and what that colour means depends on the
                  * row: a deadline state where there is one, the note's own folder where there
                  * isn't. Everything used to be the same grey, so a list of notes had no colour at
                  * all and the two rows that did carry a state didn't stand out from it either.
                  */}
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: mark.soft, color: mark.color }}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>

                {/*
                  * Two lines on every row, not on some.
                  *
                  * The state used to be a second line that only tasks had, so rows were two
                  * different heights and the list had no rhythm. Every row carries a second line
                  * now and there is always something in it — the deadline where there is one, and
                  * where the note lives otherwise, which is the thing a list on the Tree page is
                  * most often being scanned for.
                  */}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'min-w-0 truncate text-[13.5px] leading-tight text-[var(--color-text)]',
                        task.isImportant ? 'font-semibold' : 'font-medium',
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

                  <span className="flex min-w-0 items-center gap-1.5 leading-tight">
                    {lifecycle === 'note' ? null : <TaskCountdown task={task} compact />}
                    {lifecycle === 'note' ? null : (
                      <span aria-hidden className="text-[10px] text-[var(--color-text-muted)] opacity-40">
                        ·
                      </span>
                    )}
                    {/*
                      * The note's own first words, and the folder only when it has none.
                      *
                      * A path is the same for every note in a folder, so a list of six from the
                      * same place read as six copies of one line. What the note actually says is
                      * the thing that tells them apart — and on the Tree page the folder is
                      * already drawn directly underneath.
                      */}
                    <span className="min-w-0 truncate text-[11px] text-[var(--color-text-muted)]">
                      {snippet(task) || folderPathLabel(folders, task.folderId)}
                    </span>
                  </span>
                </span>

                {task.tags.length > 0 ? (
                  <span className="hidden shrink-0 gap-1 sm:flex">
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

                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
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
