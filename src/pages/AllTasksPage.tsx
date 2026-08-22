import { useState } from 'react'
import { ClipboardList, Pin, Plus } from 'lucide-react'
import type { Task } from '../types'
import { TagFilterMenu } from '../components/folder/TagFilterMenu'
import { AllTaskTile } from '../components/task/AllTaskTile'
import { NewTaskDialog } from '../components/task/NewTaskDialog'
import { TaskCard } from '../components/task/TaskCard'
import { TaskEditorDialog } from '../components/task/TaskEditorDialog'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { useFolders } from '../hooks/useFolders'
import { useTileGrid } from '../hooks/useTileGrid'
import {
  COLLAPSIBLE_TITLE_CLASS,
  FLOATING_HEADER_CLASS,
  useFloatingHeader,
} from '../hooks/useFloatingHeader'
import { getRootCategoryForFolder, scatterCategoryForId } from '../lib/folderColor'
import { focusTaskTitle } from '../lib/focusTaskTitle'
import { readViewStyle } from '../lib/viewStyle'
import { cn } from '../lib/cn'


export function AllTasksPage() {
  const { folders, tasks } = useFolders()
  const { user } = useAuth()
  // The Notes style preference applies wherever notes are listed, this page included — it used
  // to be honoured only by the folder views and Important, so picking "Professional" appeared
  // to do nothing here.
  const viewStyle = readViewStyle(user?.user_metadata as Record<string, unknown> | undefined)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  // Same floating top bar as the folder view, so the two pages' headers line up.
  const { headerRef, contentRef, condensed } = useFloatingHeader()
  const tileGrid = useTileGrid()

  const allTagsInScope = Array.from(new Set(tasks.flatMap((task) => task.tags))).sort()
  const visibleTasks = activeTag ? tasks.filter((task) => task.tags.includes(activeTag)) : tasks
  const pinnedTasks = visibleTasks.filter((task) => task.isPinned)
  const otherTasks = visibleTasks.filter((task) => !task.isPinned)

  const folderNameFor = (folderId: string) => folders.find((item) => item.id === folderId)?.name

  const renderTaskGrid = (taskList: Task[]) =>
    viewStyle === 'clipboard' ? (
      <div className={tileGrid.className} style={tileGrid.style}>
        {taskList.map((task) => (
          <AllTaskTile
            key={task.id}
            taskId={task.id}
            category={scatterCategoryForId(task.id)}
            folderLabel={folderNameFor(task.folderId)}
            onOpen={() => setOpenTaskId(task.id)}
          />
        ))}
      </div>
    ) : (
      // The same grid the tiles use, so "tiles per row" means the same thing in both styles; a
      // masonry column layout could never honour a column count the user picked.
      <div className={tileGrid.className} style={tileGrid.style}>
        {taskList.map((task) => (
          <div key={task.id}>
            <TaskCard
              taskId={task.id}
              title={task.title}
              // This page mixes folders, so a card takes the color of its own folder's root
              // rather than one page-wide category.
              category={getRootCategoryForFolder(folders, task.folderId)}
              folderLabel={folderNameFor(task.folderId)}
              onOpen={() => setOpenTaskId(task.id)}
            />
          </div>
        ))}
      </div>
    )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={headerRef} className={FLOATING_HEADER_CLASS}>
        {/* Full header at the top of the page, controls only once it's scrolled — a bar that
            overlays the content shouldn't keep spending its height on a title you've read. */}
        <div
          className={cn(
            COLLAPSIBLE_TITLE_CLASS,
            condensed ? 'max-h-0 opacity-0' : 'mb-2 max-h-12 opacity-100',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] sm:h-9 sm:w-9">
              <ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            </span>
            <h1
              className="truncate text-[18px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[22px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tasks
            </h1>
          </div>
        </div>

        {/* The row that survives scrolling: sort on the left, the primary action on the right. */}
        <div className="flex items-center justify-between gap-2">
          {allTagsInScope.length > 0 ? (
            <TagFilterMenu tags={allTagsInScope} activeTag={activeTag} onSelect={setActiveTag} />
          ) : (
            <span />
          )}
          <Button
            variant="primary"
            size="sm"
            className="h-8 shrink-0 sm:h-9"
            onClick={() => setNewTaskOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New Task
          </Button>
        </div>
      </div>

      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 sm:px-6 lg:pb-5 lg:pt-1"
      >
        {pinnedTasks.length > 0 ? (
          <section className="mt-4 lg:mt-6">
            <h2 className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)] sm:px-3 sm:py-1 sm:text-xs">
              <Pin className="h-3 w-3 fill-current" aria-hidden />
              Pinned tasks
            </h2>
            {renderTaskGrid(pinnedTasks)}
          </section>
        ) : null}

        <section className="mt-4 lg:mt-6">
          <h2 className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:px-3 sm:py-1 sm:text-xs">
            All tasks
          </h2>
          {visibleTasks.length === 0 ? (
            <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
              {activeTag
                ? `No tasks tagged "${activeTag}"`
                : 'No tasks yet — use New Task to create one in any folder.'}
            </p>
          ) : otherTasks.length === 0 ? (
            <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">All tasks are pinned.</p>
          ) : (
            renderTaskGrid(otherTasks)
          )}
        </section>
      </div>

      <NewTaskDialog
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreated={(task) => {
          // Straight into the editor, same as creating a task from inside a folder.
          setOpenTaskId(task.id)
          focusTaskTitle(task.id)
        }}
      />

      {openTaskId ? (
        <TaskEditorDialog taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      ) : null}
    </div>
  )
}
