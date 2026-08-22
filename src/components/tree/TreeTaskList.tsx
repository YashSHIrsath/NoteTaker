import { FileText, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Task } from '../../types'
import { useFolders } from '../../hooks/useFolders'
import { cn } from '../../lib/cn'

export interface TreeTaskListProps {
  tasks: Task[]
  /** How many rows to show before the "N more" link takes over. */
  limit?: number
}

const DEFAULT_LIMIT = 5

/** Important tasks first (they're the ones worth a bird's-eye slot), each keeping the app's own
 *  order within its group so this never contradicts the Tasks page it links into. */
function previewOrder(tasks: Task[]): Task[] {
  return [...tasks.filter((task) => task.isImportant), ...tasks.filter((task) => !task.isImportant)]
}

/** The Tree page's task counterpart to the folder structure below it: a short, flat peek at the
 *  workspace's notes with a way through to the full list. */
export function TreeTaskList({ tasks, limit = DEFAULT_LIMIT }: TreeTaskListProps) {
  const navigate = useNavigate()
  const { folders } = useFolders()
  const visible = previewOrder(tasks).slice(0, limit)
  const remaining = tasks.length - visible.length

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)] shadow-[var(--shadow-sm)]">
        No notes yet.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-sm)] sm:p-3">
      <ul className="flex flex-col gap-0.5">
        {visible.map((task) => {
          const folderName = folders.find((folder) => folder.id === task.folderId)?.name
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => navigate(`/task/${task.id}`)}
                className={cn(
                  'flex w-full min-w-0 items-center gap-2.5 rounded-full px-2 py-1.5 text-left transition-colors',
                  'hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    task.isImportant
                      ? 'bg-[var(--cat-rose-soft)] text-[var(--cat-rose)]'
                      : 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
                  )}
                  aria-hidden
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    task.isImportant ? 'font-semibold text-[var(--color-text)]' : 'text-[var(--color-text)]',
                  )}
                >
                  {task.title.trim() || 'Untitled'}
                </span>
                {task.isImportant ? (
                  <Star
                    className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--cat-rose)]"
                    aria-label="Important"
                  />
                ) : null}
                {folderName ? (
                  // Same reasoning as the tree rows' meta text: it's secondary, so it yields the
                  // whole row rather than squeezing the note's own title on a narrow screen.
                  <span className="hidden shrink-0 truncate text-[11.5px] text-[var(--color-text-muted)] sm:inline">
                    in {folderName}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => navigate('/tasks')}
          className="mt-1 w-full rounded-full px-2 py-1.5 text-left text-[12.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
        >
          {remaining} more&hellip;
        </button>
      ) : null}
    </div>
  )
}
