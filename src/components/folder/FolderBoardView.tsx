import { useState, type DragEvent } from 'react'
import { ChevronRight, Folder as FolderIcon, Plus } from 'lucide-react'
import type { Folder as FolderRecord, Task } from '../../types'
import { TaskCard } from '../task/TaskCard'
import { useFolders } from '../../hooks/useFolders'
import { useItemDnd } from '../../context/ItemDndContext'
import { cn } from '../../lib/cn'
import { categoryVar, type FolderCategory } from '../../lib/folderColor'
import { focusTaskTitle } from '../../lib/focusTaskTitle'

export interface FolderBoardColumn {
  folder: FolderRecord
  category: FolderCategory
  /** The board's own "current folder" column isn't navigable — you're already there. */
  navigable?: boolean
}

export interface FolderBoardViewProps {
  columns: FolderBoardColumn[]
  tasksByFolderId: Record<string, Task[]>
  onOpenTask: (taskId: string) => void
  onOpenFolder: (folderId: string) => void
}

const NEW_TASK_TITLE = 'New note'

function BoardColumn({
  folder,
  category,
  navigable,
  tasks,
  onOpenTask,
  onOpenFolder,
}: {
  folder: FolderRecord
  category: FolderCategory
  navigable: boolean
  tasks: Task[]
  onOpenTask: (taskId: string) => void
  onOpenFolder: (folderId: string) => void
}) {
  const { createTask, moveTaskToFolder } = useFolders()
  const { getDragging, endDrag, dropZoneId } = useItemDnd()
  const [dropActive, setDropActive] = useState(false)
  const [creating, setCreating] = useState(false)

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const session = getDragging()
    if (!session || session.kind !== 'task') {
      return
    }
    event.preventDefault()
    setDropActive(true)
  }

  const handleDragLeave = () => setDropActive(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const session = getDragging()
    setDropActive(false)
    if (!session || session.kind !== 'task') {
      return
    }
    event.preventDefault()
    if (session.groupId !== folder.id) {
      moveTaskToFolder(session.itemId, folder.id)
    }
    endDrag()
  }

  const handleAddTask = () => {
    setCreating(true)
    void createTask(NEW_TASK_TITLE, folder.id)
      .then((task) => {
        onOpenTask(task.id)
        focusTaskTitle(task.id)
      })
      .finally(() => setCreating(false))
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      // data-dnd-zone is how a touch drag finds this column: there are no dragover events to
      // rely on, so the pointer path hit-tests for the zone under the finger instead.
      data-dnd-zone={folder.id}
      className={cn(
        'anim-item-in flex flex-col rounded-[24px] border bg-[var(--color-surface-muted)] transition-all duration-200 ease-out',
        dropActive || dropZoneId === folder.id
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_0_0_1px_rgba(139,133,240,0.18),0_18px_36px_rgba(0,0,0,0.22)]'
          : 'border-[var(--color-border)] shadow-[0_8px_22px_rgba(0,0,0,0.12)]',
      )}
    >
      {navigable ? (
        <button
          type="button"
          onClick={() => onOpenFolder(folder.id)}
          className="flex shrink-0 items-center gap-2 rounded-t-2xl px-3 py-3 text-left transition-colors hover:bg-[var(--color-hover)]"
        >
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: categoryVar(category) }}
            aria-hidden
          >
            <FolderIcon className="h-3.5 w-3.5 text-white" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--color-text)]">
            {folder.name}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--color-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
            {tasks.length}
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-2 px-3 py-3">
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: categoryVar(category) }}
            aria-hidden
          >
            <FolderIcon className="h-3.5 w-3.5 text-white" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--color-text)]">
            {folder.name}
          </span>
          <span className="shrink-0 rounded-full bg-[var(--color-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]">
            {tasks.length}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-2.5 pb-2.5">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            taskId={task.id}
            title={task.title}
            category={category}
            onOpen={() => onOpenTask(task.id)}
          />
        ))}
      </div>

      <div className="shrink-0 p-2.5 pt-0">
        <button
          type="button"
          onClick={handleAddTask}
          disabled={creating}
          className="flex w-full items-center justify-center gap-1.5 rounded-full px-2.5 py-2 text-[12.5px] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add task
        </button>
      </div>
    </div>
  )
}

export function FolderBoardView({ columns, tasksByFolderId, onOpenTask, onOpenFolder }: FolderBoardViewProps) {
  return (
    <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {columns.map(({ folder, category, navigable = true }) => (
        <BoardColumn
          key={folder.id}
          folder={folder}
          category={category}
          navigable={navigable}
          tasks={tasksByFolderId[folder.id] ?? []}
          onOpenTask={onOpenTask}
          onOpenFolder={onOpenFolder}
        />
      ))}
    </div>
  )
}
