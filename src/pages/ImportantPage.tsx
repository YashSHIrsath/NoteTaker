import { useState } from 'react'
import { FileText, Folder, Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/common/EmptyState'
import { StarButton } from '../components/common/StarButton'
import { RowDeleteButton } from '../components/common/RowDeleteButton'
import { FolderActions } from '../components/folder/FolderActions'
import { AllTaskTile } from '../components/task/AllTaskTile'
import { TaskGridCanvas } from '../components/task/TaskGridCanvas'
import { TaskEditorDialog } from '../components/task/TaskEditorDialog'
import { useAuth } from '../hooks/useAuth'
import { useDeleteTask } from '../hooks/useDeleteTask'
import { useFolders } from '../hooks/useFolders'
import { folderPathLabel, getImportantFolders } from '../lib/folders'
import { getImportantTasks } from '../lib/tasks'
import { categoryVar, getRootCategoryForFolder, scatterCategoryForId } from '../lib/folderColor'
import { taskColorStyle } from '../lib/taskColor'
import { readViewStyle } from '../lib/viewStyle'
import { usePageEnter } from '../hooks/usePageEnterDirection'
import { cn } from '../lib/cn'
import { performWithTaskExit } from '../lib/taskExitAnimation'
import {
  COLLAPSIBLE_TITLE_CLASS,
  FLOATING_HEADER_CLASS,
  useFloatingHeader,
} from '../hooks/useFloatingHeader'

const CARD_GRID = 'mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3'
// Same width rule as the task tiles: rows only split into columns once each one has room.
const FOLDER_GRID =
  'mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2.5 sm:gap-3'
const CARD_BASE =
  'anim-item-in group relative flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2.5 transition-all hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)] sm:gap-3 sm:p-3'
const CARD_ACTIONS = 'flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'folders', label: 'Folders' },
  { key: 'tasks', label: 'Tasks' },
] as const

type ImportantFilter = (typeof FILTERS)[number]['key']

export function ImportantPage() {
  const navigate = useNavigate()
  const { folders, tasks, toggleFolderImportant, toggleTaskImportant } = useFolders()
  const { requestTaskDelete, dialog } = useDeleteTask()
  const { user } = useAuth()
  const viewStyle = readViewStyle(user?.user_metadata as Record<string, unknown> | undefined)
  const [filter, setFilter] = useState<ImportantFilter>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const { headerRef, contentRef, condensed } = useFloatingHeader()
  // Which side this whole view slides in from — the side of the bar you came from.
  const pageEnter = usePageEnter()
  const importantFolders = getImportantFolders(folders)
  const importantTasks = getImportantTasks(tasks)
  const isEmpty = importantFolders.length === 0 && importantTasks.length === 0
  const showFolders = filter !== 'tasks'
  const showTasks = filter !== 'folders'
  const allTagsInScope = Array.from(new Set(importantTasks.flatMap((task) => task.tags))).sort()
  const visibleImportantTasks = activeTag
    ? importantTasks.filter((task) => task.tags.includes(activeTag))
    : importantTasks

  const removeTaskFromImportant = (taskId: string) => {
    void performWithTaskExit(taskId, () => toggleTaskImportant(taskId))
  }

  if (isEmpty) {
    return (
      <EmptyState
        title="Important"
        description="Star a folder or task to see it here."
      />
    )
  }

  return (
    // The animation sits on the whole view, header included, so the page arrives as one piece
    // rather than as a list sliding around underneath a stationary title.
    <div
      className={cn('relative flex h-full min-h-0 flex-col', pageEnter.className)}
      style={pageEnter.style}
    >
      <div ref={headerRef} className={FLOATING_HEADER_CLASS}>
        {/* Full header at the top of the page, controls only once it's scrolled — a bar that
            overlays the content shouldn't keep spending its height on a title you've read. */}
        <div
          className={cn(
            COLLAPSIBLE_TITLE_CLASS,
            condensed ? 'max-h-0 opacity-0' : 'mb-2 max-h-16 opacity-100',
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--cat-rose-soft)] text-[var(--cat-rose)] sm:h-9 sm:w-9">
              <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h1
                className="truncate text-[17px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[20px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Important
              </h1>
              <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-text-muted)] sm:text-[12.5px]">
                Your starred folders and tasks, all in one place.
              </p>
            </div>
            <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] p-1">
            {FILTERS.map((item) => {
              const count =
                item.key === 'folders'
                  ? importantFolders.length
                  : item.key === 'tasks'
                    ? importantTasks.length
                    : importantFolders.length + importantTasks.length
              const active = filter === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(item.key)}
                  className={cn(
                    'anim-press flex-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold transition-[background-color,color,box-shadow,transform] duration-200 lg:flex-none',
                    active
                      ? 'bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                  )}
                >
                  {item.label}
                  <span className="ml-1 text-[11px] font-medium opacity-70">{count}</span>
                </button>
              )
            })}
          </div>
          </div>
        </div>
      </div>

      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface-muted)] px-4 pb-28 sm:px-6 lg:pb-5"
      >
        {showFolders ? (
        <section className="mt-3 sm:mt-4 lg:mt-6">
          <h2 className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:px-3 sm:py-1 sm:text-xs">
            Folders
          </h2>
          {importantFolders.length === 0 ? (
            <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
              No important folders
            </p>
          ) : (
            <div className={FOLDER_GRID}>
              {importantFolders.map((folder) => {
                const category = getRootCategoryForFolder(folders, folder.id)
                return (
                  <div key={folder.id} className={CARD_BASE}>
                    <button
                      type="button"
                      onClick={() => navigate(`/folder/${folder.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
                    >
                      <span
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: categoryVar(category, 'soft') }}
                        aria-hidden
                      >
                        <Folder className="h-4 w-4" style={{ color: categoryVar(category) }} aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[14px] font-semibold leading-snug text-[var(--color-text)]">
                          {folder.name}
                        </span>
                        {/* This view mixes root folders with deeply nested ones, so the name on
                            its own never says where the folder actually lives. */}
                        <span className="truncate text-[11px] leading-snug text-[var(--color-text-muted)]">
                          {folderPathLabel(folders, folder.id, { includeSelf: false })}
                        </span>
                      </span>
                    </button>
                    <div className={CARD_ACTIONS}>
                      <StarButton
                        important={folder.isImportant}
                        onToggle={() => toggleFolderImportant(folder.id)}
                      />
                      <FolderActions folderId={folder.id} folderName={folder.name} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        ) : null}

        {showTasks ? (
        <section className="mt-5 sm:mt-6 lg:mt-8">
          <h2 className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:px-3 sm:py-1 sm:text-xs">
            Tasks
          </h2>

          {allTagsInScope.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-medium text-[var(--color-text-muted)]">Sort by tags:</span>
              {allTagsInScope.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={activeTag === tag}
                  onClick={() => setActiveTag((current) => (current === tag ? null : tag))}
                  className={cn(
                    'anim-press rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                    activeTag === tag
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                  )}
                >
                  {tag}
                </button>
              ))}
              {activeTag ? (
                <button
                  type="button"
                  onClick={() => setActiveTag(null)}
                  className="text-[12px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}

          {visibleImportantTasks.length === 0 ? (
            <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
              {activeTag ? `No important tasks tagged "${activeTag}"` : 'No important tasks'}
            </p>
          ) : viewStyle === 'clipboard' ? (
            <TaskGridCanvas
              tasks={visibleImportantTasks}
              className="mt-3"
              handleColor={(task) => taskColorStyle(task.color, scatterCategoryForId(task.id)).ink}
            >
              {(task) => (
                <AllTaskTile
                  taskId={task.id}
                  category={scatterCategoryForId(task.id)}
                  folderLabel={folderPathLabel(folders, task.folderId)}
                  onOpen={() => setOpenTaskId(task.id)}
                />
              )}
            </TaskGridCanvas>
          ) : (
            <div className={CARD_GRID}>
              {visibleImportantTasks.map((task) => {
                const category = getRootCategoryForFolder(folders, task.folderId)
                const folderTrail = folderPathLabel(folders, task.folderId)
                return (
                  <div key={task.id} className={CARD_BASE} data-task-id={task.id}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/folder/${task.folderId}`, { state: { openTaskId: task.id } })
                      }
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
                    >
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-hover)] text-[var(--color-text-muted)]"
                        aria-hidden
                      >
                        <FileText className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span
                          className="w-fit max-w-full truncate rounded-full border px-2 py-0.5 text-[13.5px] font-semibold leading-tight"
                          style={{
                            borderColor: categoryVar(category, 'soft'),
                            background: categoryVar(category, 'soft'),
                            color: categoryVar(category, 'ink'),
                          }}
                        >
                          {task.title}
                        </span>
                        <span className="truncate text-[11.5px] text-[var(--color-text-muted)]">
                          in {folderTrail}
                        </span>
                        {task.tags.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {task.tags.map((tag) => (
                              <span
                                key={tag}
                                className="truncate rounded-full bg-[var(--color-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <div className={CARD_ACTIONS}>
                      <StarButton
                        important={task.isImportant}
                        onToggle={() => removeTaskFromImportant(task.id)}
                      />
                      <RowDeleteButton
                        label={`Delete ${task.title}`}
                        onClick={() => requestTaskDelete(task.id)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        ) : null}
      </div>

      {dialog}
      {openTaskId ? (
        <TaskEditorDialog taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      ) : null}
    </div>
  )
}
