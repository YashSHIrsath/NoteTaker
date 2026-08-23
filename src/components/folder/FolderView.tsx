import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Folder, FolderTree, Kanban, LayoutList, Pin, Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Folder as FolderRecord, Task } from '../../types'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { FolderBreadcrumb } from './FolderBreadcrumb'
import { FolderSidePanel } from './FolderSidePanel'
import { FolderBoardView } from './FolderBoardView'
import { CreateFolderDialog } from './CreateFolderDialog'
import { TaskCard } from '../task/TaskCard'
import { AllTaskTile } from '../task/AllTaskTile'
import { TaskGridCanvas } from '../task/TaskGridCanvas'
import { TaskEditorDialog } from '../task/TaskEditorDialog'
import { useFolders } from '../../hooks/useFolders'
import { useAuth } from '../../hooks/useAuth'
import { useIsCompact } from '../../hooks/useMediaQuery'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import { cn } from '../../lib/cn'
import { StarButton } from '../common/StarButton'
import { FolderActions } from './FolderActions'
import { TagFilterMenu } from './TagFilterMenu'
import { categoryVar, getRootCategoryForFolder, scatterCategoryForId } from '../../lib/folderColor'
import { taskColorStyle } from '../../lib/taskColor'
import { focusTaskTitle } from '../../lib/focusTaskTitle'
import { readViewStyle } from '../../lib/viewStyle'
import {
  COLLAPSIBLE_TITLE_CLASS,
  FLOATING_HEADER_CLASS,
  useFloatingHeader,
} from '../../hooks/useFloatingHeader'

export interface FolderViewProps {
  folder: FolderRecord
  path: FolderRecord[]
  childFolders: FolderRecord[]
  tasks: Task[]
  onCreateFolder: (name: string) => void
  onCreateTask: (title: string) => Promise<Task>
}

type ViewMode = 'list' | 'board'

const NEW_TASK_TITLE = 'New note'
const SUBFOLDER_PANEL_WIDTH = 304

export function FolderView({
  folder,
  path,
  childFolders,
  tasks,
  onCreateFolder,
  onCreateTask,
}: FolderViewProps) {
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [foldersPanelOpen, setFoldersPanelOpen] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  )
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const isCompact = useIsCompact()
  const subfolderPanel = useAnchoredPanel<HTMLDivElement>(SUBFOLDER_PANEL_WIDTH)
  // Below lg the folder header floats over the scrolling content instead of taking a band of its
  // own; the hook measures it so the content can leave that much room clear.
  const { headerRef, contentRef, condensed } = useFloatingHeader()
  const navigate = useNavigate()
  const location = useLocation()
  const { folders, getForest, getTasksInFolder, toggleFolderImportant } = useFolders()
  const { user } = useAuth()
  const viewStyle = readViewStyle(user?.user_metadata as Record<string, unknown> | undefined)
  const locationPathIds = new Set(path.map((item) => item.id))
  const forest = getForest()

  // Arriving here from elsewhere (e.g. the Important page) can ask for a specific task's
  // popup to open immediately, passed as navigation state rather than a URL param so it
  // doesn't linger — keyed on location.key so it fires again even if this same FolderView
  // instance is reused for a different folder without unmounting.
  useEffect(() => {
    const state = location.state as { openTaskId?: string } | null
    if (!state?.openTaskId) {
      return
    }
    setOpenTaskId(state.openTaskId)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.key, location.pathname, location.state, navigate])
  const category = getRootCategoryForFolder(folders, folder.id)
  // Board view only makes sense once there's something to spread across columns — derived
  // rather than synced via an effect so a folder with no children never flashes an empty board.
  const effectiveViewMode: ViewMode = childFolders.length === 0 ? 'list' : viewMode

  const openChildFolder = (folderId: string) => {
    subfolderPanel.setOpen(false)
    navigate(`/folder/${folderId}`)
  }

  const boardColumns = [
    { folder, category, navigable: false },
    ...childFolders.map((child) => ({ folder: child, category: getRootCategoryForFolder(folders, child.id) })),
  ]
  const tasksByFolderId = Object.fromEntries(
    boardColumns.map(({ folder: columnFolder }) => [columnFolder.id, getTasksInFolder(columnFolder.id)]),
  )

  // Tags are cross-cutting, so the filter draws from every task in scope (this folder plus,
  // in board mode, its immediate sub-folder columns) — not just the current view's list.
  const allTagsInScope = Array.from(
    new Set(Object.values(tasksByFolderId).flat().flatMap((task) => task.tags)),
  ).sort()
  const byActiveTag = <T extends Task>(list: T[]): T[] =>
    activeTag ? list.filter((task) => task.tags.includes(activeTag)) : list
  // Board columns don't split into a separate "Pinned" section like list mode does, so a
  // pinned task needs to sort to the top of its own column instead.
  const pinnedFirst = <T extends Task>(list: T[]): T[] =>
    [...list].sort((a, b) => Number(b.isPinned) - Number(a.isPinned))
  const filteredTasksByFolderId = Object.fromEntries(
    Object.entries(tasksByFolderId).map(([id, list]) => [id, pinnedFirst(byActiveTag(list))]),
  )

  const visibleTasks = byActiveTag(tasks)
  const pinnedTasks = visibleTasks.filter((task) => task.isPinned)
  const otherTasks = visibleTasks.filter((task) => !task.isPinned)

  const renderTaskGrid = (taskList: Task[]) =>
    viewStyle === 'clipboard' ? (
      <TaskGridCanvas
        tasks={taskList}
        className="mt-3"
        handleColor={(task) => taskColorStyle(task.color, scatterCategoryForId(task.id)).ink}
      >
        {(task) => (
          <AllTaskTile
            key={task.id}
            taskId={task.id}
            category={scatterCategoryForId(task.id)}
            onOpen={() => setOpenTaskId(task.id)}
          />
        )}
      </TaskGridCanvas>
    ) : (
      // The same canvas the tiles use, so a card keeps its place and size whichever style is on.
      <TaskGridCanvas tasks={taskList} className="mt-3">
        {(task) => (
          <TaskCard
              taskId={task.id}
              title={task.title}
              category={category}
            onOpen={() => setOpenTaskId(task.id)}
          />
        )}
      </TaskGridCanvas>
    )

  const handleCreateTask = () => {
    void onCreateTask(NEW_TASK_TITLE).then((task) => {
      setOpenTaskId(task.id)
      focusTaskTitle(task.id)
    })
  }

  return (
    <div className="relative flex h-full min-h-0">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={headerRef} className={FLOATING_HEADER_CLASS}>
          {/* Two bands: what the page *is* (breadcrumb + folder identity), and what you can *do*
            *  here. Only the first rolls up on scroll, so the bar keeps shrinking to its controls
            *  as you read instead of holding a title you've already seen — while "which folder am
            *  I in" is one scroll back to the top away. */}
          <div
            className={cn(
              COLLAPSIBLE_TITLE_CLASS,
              condensed ? 'max-h-0 opacity-0' : 'mb-2 max-h-28 opacity-100',
            )}
          >
            <FolderBreadcrumb path={path} />

            <div className="mt-2 flex w-full min-w-0 items-center justify-between gap-2 sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-[var(--shadow-sm)] sm:h-9 sm:w-9"
                  style={{ background: categoryVar(category, 'soft'), color: categoryVar(category, 'ink') }}
                  aria-hidden
                >
                  <Folder className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
                </span>
                <h1
                  className="min-w-0 truncate text-[16px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[20px]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {folder.name}
                </h1>
                <StarButton
                  important={folder.isImportant}
                  onToggle={() => toggleFolderImportant(folder.id)}
                />
              </div>

              <div ref={subfolderPanel.anchorRef} className="flex shrink-0 items-center gap-1">
                <FolderActions folderId={folder.id} folderName={folder.name} />
                {effectiveViewMode === 'list' ? (
                  <IconButton
                    label={
                      (isCompact ? subfolderPanel.open : foldersPanelOpen)
                        ? 'Hide subfolders'
                        : 'Browse subfolders'
                    }
                    aria-pressed={isCompact ? subfolderPanel.open : foldersPanelOpen}
                    onClick={() => {
                      if (isCompact) {
                        subfolderPanel.setOpen((open) => !open)
                        return
                      }
                      setFoldersPanelOpen((open) => !open)
                    }}
                    className={cn(
                      (isCompact ? subfolderPanel.open : foldersPanelOpen) &&
                        'bg-[var(--color-hover)] text-[var(--color-text)]',
                    )}
                  >
                    <FolderTree className="h-5 w-5" />
                  </IconButton>
                ) : null}
              </div>
            </div>
          </div>

          {/* The row that survives scrolling. */}
          <div className="flex w-full items-center justify-between gap-1.5 sm:gap-2">
            <Button variant="primary" size="sm" className="h-8 sm:h-9" onClick={handleCreateTask}>
              <Plus className="h-4 w-4" aria-hidden />
              New Task
            </Button>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Button variant="subtle" size="sm" className="h-8 sm:h-9" onClick={() => setFolderDialogOpen(true)}>
                <Folder className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">New Folder</span>
              </Button>
              {childFolders.length > 0 ? (
                <div className="inline-flex h-8 items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] p-1 sm:h-9">
                  <button
                    type="button"
                    aria-pressed={viewMode === 'list'}
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'anim-press inline-flex h-full items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow,transform] duration-200',
                      viewMode === 'list'
                        ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                    )}
                  >
                    <LayoutList className="h-3.5 w-3.5" aria-hidden />
                    <span className="hidden sm:inline">List</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewMode === 'board'}
                    onClick={() => setViewMode('board')}
                    className={cn(
                      'anim-press inline-flex h-full items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow,transform] duration-200',
                      viewMode === 'board'
                        ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                    )}
                  >
                    <Kanban className="h-3.5 w-3.5" aria-hidden />
                    <span className="hidden sm:inline">Board</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {effectiveViewMode === 'board' ? (
          <div
            ref={contentRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 sm:px-6 lg:pb-5"
          >
            {allTagsInScope.length > 0 ? (
              <div className="mt-3 sm:mt-4">
                <TagFilterMenu tags={allTagsInScope} activeTag={activeTag} onSelect={setActiveTag} />
              </div>
            ) : null}
            <FolderBoardView
              columns={boardColumns}
              tasksByFolderId={filteredTasksByFolderId}
              onOpenTask={setOpenTaskId}
              onOpenFolder={openChildFolder}
            />
          </div>
        ) : (
          <div
            ref={contentRef}
            className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface-muted)] px-4 pb-28 sm:px-6 lg:pb-5"
          >
            {allTagsInScope.length > 0 ? (
              <div className="mt-3 sm:mt-4">
                <TagFilterMenu tags={allTagsInScope} activeTag={activeTag} onSelect={setActiveTag} />
              </div>
            ) : null}
            {pinnedTasks.length > 0 ? (
              <section className="mt-2 sm:mt-6">
                <h2 className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)] sm:px-3 sm:py-1 sm:text-xs">
                  <Pin className="h-3 w-3 fill-current" aria-hidden />
                  Pinned tasks
                </h2>
                {renderTaskGrid(pinnedTasks)}
              </section>
            ) : null}

            <section className="mt-2 sm:mt-6">
              <h2 className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:px-3 sm:py-1 sm:text-xs">
                Tasks
              </h2>
              {visibleTasks.length === 0 ? (
                <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
                  {activeTag ? `No tasks tagged "${activeTag}"` : 'No tasks'}
                </p>
              ) : otherTasks.length === 0 ? (
                <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
                  All tasks in this folder are pinned.
                </p>
              ) : (
                renderTaskGrid(otherTasks)
              )}
            </section>
          </div>
        )}
      </div>

      {effectiveViewMode === 'list' ? (
        <>
          <FolderSidePanel
            folders={childFolders}
            currentFolderId={folder.id}
            forest={forest}
            locationPathIds={locationPathIds}
            onSelectFolder={openChildFolder}
            onCreateFolder={() => setFolderDialogOpen(true)}
            className={cn('hidden lg:flex', !foldersPanelOpen && 'lg:hidden')}
          />

          {subfolderPanel.open && subfolderPanel.position
            ? createPortal(
                <div
                  ref={subfolderPanel.panelRef}
                  role="dialog"
                  aria-label="Subfolders"
                  className="anim-panel-in fixed z-50 w-[19rem] max-w-[calc(100vw-1rem)] lg:hidden"
                  style={{ top: subfolderPanel.position.top, left: subfolderPanel.position.left }}
                >
                  <FolderSidePanel
                    folders={childFolders}
                    currentFolderId={folder.id}
                    forest={forest}
                    locationPathIds={locationPathIds}
                    onSelectFolder={openChildFolder}
                    onCreateFolder={() => {
                      subfolderPanel.setOpen(false)
                      setFolderDialogOpen(true)
                    }}
                    variant="popover"
                  />
                </div>,
                document.body,
              )
            : null}

          {!foldersPanelOpen ? (
            <div className="hidden h-full shrink-0 flex-col items-center border-l border-[var(--color-border)] bg-[var(--color-surface-muted)] px-1.5 py-3 lg:flex">
              <IconButton label="Show folders" onClick={() => setFoldersPanelOpen(true)}>
                <Folder className="h-4 w-4" />
              </IconButton>
            </div>
          ) : null}
        </>
      ) : null}

      <CreateFolderDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        onCreate={onCreateFolder}
      />
      {openTaskId ? (
        <TaskEditorDialog taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      ) : null}
    </div>
  )
}
