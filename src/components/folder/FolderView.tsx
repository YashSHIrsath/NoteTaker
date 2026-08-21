import { useState } from 'react'
import { Folder, PanelRight, PanelRightClose, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Folder as FolderRecord, Task } from '../../types'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { FolderBreadcrumb } from './FolderBreadcrumb'
import { FolderSidePanel } from './FolderSidePanel'
import { CreateFolderDialog } from './CreateFolderDialog'
import { CreateTaskDialog } from '../task/CreateTaskDialog'
import { TaskItem } from '../task/TaskItem'
import { useFolders } from '../../hooks/useFolders'
import { cn } from '../../lib/cn'
import { StarButton } from '../common/StarButton'
import { FolderActions } from './FolderActions'

export interface FolderViewProps {
  folder: FolderRecord
  path: FolderRecord[]
  childFolders: FolderRecord[]
  tasks: Task[]
  onCreateFolder: (name: string) => void
  onCreateTask: (title: string) => void
}

export function FolderView({
  folder,
  path,
  childFolders,
  tasks,
  onCreateFolder,
  onCreateTask,
}: FolderViewProps) {
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [foldersPanelOpen, setFoldersPanelOpen] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  )
  const navigate = useNavigate()
  const { getForest, getSubtasksForTask, toggleSubtaskCompleted, toggleFolderImportant } = useFolders()
  const locationPathIds = new Set(path.map((item) => item.id))
  const forest = getForest()

  const openChildFolder = (folderId: string) => {
    navigate(`/folder/${folderId}`)
  }

  return (
    <div className="relative flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <FolderBreadcrumb path={path} />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
              {folder.name}
            </h1>
            <StarButton
              important={folder.isImportant}
              onToggle={() => toggleFolderImportant(folder.id)}
            />
            <FolderActions folderId={folder.id} folderName={folder.name} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="subtle" size="sm" onClick={() => setTaskDialogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New Task
            </Button>
            <IconButton
              label={foldersPanelOpen ? 'Hide folders' : 'Show folders'}
              onClick={() => setFoldersPanelOpen((open) => !open)}
            >
              {foldersPanelOpen ? (
                <PanelRightClose className="h-5 w-5" />
              ) : (
                <PanelRight className="h-5 w-5" />
              )}
            </IconButton>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="px-2.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Tasks
          </h2>
          {tasks.length === 0 ? (
            <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">No tasks</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {tasks.map((task) => (
                <li key={task.id}>
                  <TaskItem
                    taskId={task.id}
                    title={task.title}
                    subtasks={getSubtasksForTask(task.id)}
                    onOpen={() => navigate(`/task/${task.id}`)}
                    onToggleSubtask={toggleSubtaskCompleted}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <FolderSidePanel
        folders={childFolders}
        currentFolderId={folder.id}
        forest={forest}
        locationPathIds={locationPathIds}
        onSelectFolder={openChildFolder}
        onCreateFolder={() => setFolderDialogOpen(true)}
        className={cn('hidden lg:flex', !foldersPanelOpen && 'lg:hidden')}
      />

      <div
        className={cn(
          'absolute inset-0 z-20 lg:hidden',
          foldersPanelOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!foldersPanelOpen}
      >
        <button
          type="button"
          aria-label="Close folders"
          className={cn(
            'absolute inset-0 bg-black/20 transition-opacity',
            foldersPanelOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setFoldersPanelOpen(false)}
        />
        <FolderSidePanel
          folders={childFolders}
          currentFolderId={folder.id}
          forest={forest}
          locationPathIds={locationPathIds}
          onSelectFolder={openChildFolder}
          onCreateFolder={() => setFolderDialogOpen(true)}
          className={cn(
            'absolute inset-y-0 right-0 z-10 shadow-lg transition-transform duration-200 ease-out',
            foldersPanelOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        />
      </div>

      {!foldersPanelOpen ? (
        <div className="hidden h-full shrink-0 flex-col items-center border-l border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-3 lg:flex">
          <IconButton label="Show folders" onClick={() => setFoldersPanelOpen(true)}>
            <Folder className="h-4 w-4" />
          </IconButton>
        </div>
      ) : null}

      <CreateFolderDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        onCreate={onCreateFolder}
      />
      <CreateTaskDialog
        open={taskDialogOpen}
        onClose={() => setTaskDialogOpen(false)}
        onCreate={onCreateTask}
      />
    </div>
  )
}
