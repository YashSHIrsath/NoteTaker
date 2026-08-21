import { FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/common/EmptyState'
import { StarButton } from '../components/common/StarButton'
import { RowDeleteButton } from '../components/common/RowDeleteButton'
import { FolderItem } from '../components/folder/FolderItem'
import { useDeleteTask } from '../hooks/useDeleteTask'
import { useFolders } from '../hooks/useFolders'
import { getImportantFolders } from '../lib/folders'
import { getImportantTasks } from '../lib/tasks'
import { cn } from '../lib/cn'

export function ImportantPage() {
  const navigate = useNavigate()
  const { folders, tasks, toggleTaskImportant } = useFolders()
  const { requestTaskDelete, dialog } = useDeleteTask()
  const importantFolders = getImportantFolders(folders)
  const importantTasks = getImportantTasks(tasks)
  const isEmpty = importantFolders.length === 0 && importantTasks.length === 0

  if (isEmpty) {
    return (
      <EmptyState
        title="Important"
        description="Star a folder or task to see it here."
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
        Important
      </h1>

      <section className="mt-6">
        <h2 className="px-2.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Folders
        </h2>
        {importantFolders.length === 0 ? (
          <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
            No important folders
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {importantFolders.map((folder) => (
              <li key={folder.id}>
                <FolderItem
                  folderId={folder.id}
                  parentId={folder.parentId}
                  name={folder.name}
                  important={folder.isImportant}
                  sortable={false}
                  onClick={() => navigate(`/folder/${folder.id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="px-2.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Tasks
        </h2>
        {importantTasks.length === 0 ? (
          <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
            No important tasks
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {importantTasks.map((task) => (
              <li key={task.id}>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => navigate(`/task/${task.id}`)}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm',
                      'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
                    )}
                  >
                    <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                    <span className="truncate font-medium">{task.title}</span>
                  </button>
                  <StarButton
                    important={task.isImportant}
                    onToggle={() => toggleTaskImportant(task.id)}
                  />
                  <RowDeleteButton
                    label={`Delete ${task.title}`}
                    onClick={() => requestTaskDelete(task.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {dialog}
    </div>
  )
}
