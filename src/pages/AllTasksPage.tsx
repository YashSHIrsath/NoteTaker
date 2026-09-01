import { useState } from 'react'
import { ClipboardList, Pin, Plus } from 'lucide-react'
import type { Task } from '../types'
import { AllTaskTile } from '../components/task/AllTaskTile'
import { TaskGridCanvas } from '../components/task/TaskGridCanvas'
import { NewTaskDialog } from '../components/task/NewTaskDialog'
import { TaskFilterMenu } from '../components/task/TaskFilterMenu'
import { TaskCard } from '../components/task/TaskCard'
import { TaskEditorDialog } from '../components/task/TaskEditorDialog'
import { Button } from '../components/ui/Button'
import { useFolders } from '../hooks/useFolders'
import { useServerNowCoarse } from '../hooks/useServerNow'
import {
  applyTaskFilters,
  emptyFilterMessage,
  filterByFolder,
  folderFilterOptions,
  type KindFilter,
  type StatusFilter,
} from '../lib/taskFilters'
import {
  COLLAPSIBLE_TITLE_CLASS,
  FLOATING_HEADER_CLASS,
  useFloatingHeader,
} from '../hooks/useFloatingHeader'
import { getRootCategoryForFolder, scatterCategoryForId } from '../lib/folderColor'
import { taskColorStyle } from '../lib/taskColor'
import { isPinnedIn } from '../lib/taskGrid'
import { inBaseOrder } from '../lib/tasks'
import { focusTaskTitle } from '../lib/focusTaskTitle'
import { useDisplaySettings } from '../hooks/useDisplaySettings'
import { usePageEnter } from '../hooks/usePageEnterDirection'
import { cn } from '../lib/cn'


/** What the section heading says once a status filter is on — the pill is the only place the
 *  page repeats back what you asked for, so it should say the narrower thing. */
const SECTION_TITLE: Partial<Record<StatusFilter, string>> = {
  incomplete: 'Incomplete',
  upcoming: 'Not due yet',
  overdue: 'Overdue',
  completed: 'Completed',
  on_time: 'Completed on time',
  late: 'Completed late',
}

export function AllTasksPage() {
  const { folders, tasks: loadedTasks } = useFolders()
  // Put in a defined order before anything filters, splits or draws it. The provider hands over
  // whatever the load returned, and for a flat listing that is rows tied on sort_order — see
  // inBaseOrder. Cards used to move between reloads without anyone touching them.
  const tasks = inBaseOrder(loadedTasks)
  // The Notes style preference applies wherever notes are listed, this page included — it used
  // to be honoured only by the folder views and Important, so picking "Professional" appeared
  // to do nothing here.
  // Space-first: inside a shared space the note style belongs to the space, so everyone sees the
  // same one. See useDisplaySettings.
  const { viewStyle } = useDisplaySettings()
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  // Coarse on purpose: the status filter needs the clock, and re-running this whole grid once a
  // second to move nothing would be a steep price for it. The cards' own countdowns still tick.
  const now = useServerNowCoarse(tasks.some((task) => task.noteKind === 'due_task'))
  // Same floating top bar as the folder view, so the two pages' headers line up.
  const { headerRef, contentRef, condensed } = useFloatingHeader()
  // Which side this whole view slides in from — the side of the bar you came from.
  const pageEnter = usePageEnter()

  const allTagsInScope = Array.from(new Set(tasks.flatMap((task) => task.tags))).sort()
  // This page is every folder at once, which is what it is for and also why it needs a way back to
  // one of them. Offered from the whole scope, so the list of folders doesn't shrink as the other
  // filters bite — the same rule the tag list and the counts already follow.
  const folderOptions = folderFilterOptions(folders, tasks)
  const folderName = folderOptions.find((option) => option.id === folderFilter)?.name ?? null
  const inFolder = filterByFolder(tasks, folders, folderFilter)
  const byTag = activeTag ? inFolder.filter((task) => task.tags.includes(activeTag)) : inFolder
  const visibleTasks = applyTaskFilters(byTag, kindFilter, statusFilter, now)
  const pinnedTasks = visibleTasks.filter((task) => isPinnedIn(task, 'tasks'))
  const otherTasks = visibleTasks.filter((task) => !isPinnedIn(task, 'tasks'))

  const folderNameFor = (folderId: string) => folders.find((item) => item.id === folderId)?.name

  const renderTaskGrid = (taskList: Task[]) =>
    viewStyle === 'clipboard' ? (
      <TaskGridCanvas
        tasks={taskList}
        scope="tasks"
        className="mt-3"
        handleColor={(task) => taskColorStyle(task.color, scatterCategoryForId(task.id)).ink}
      >
        {(task) => (
          <AllTaskTile
            scope="tasks"
            key={task.id}
            taskId={task.id}
            category={scatterCategoryForId(task.id)}
            folderLabel={folderNameFor(task.folderId)}
            onOpen={() => setOpenTaskId(task.id)}
          />
        )}
      </TaskGridCanvas>
    ) : (
      // The same canvas the tiles use, so a card keeps its place and size whichever style is on.
      <TaskGridCanvas tasks={taskList} scope="tasks" className="mt-3">
        {(task) => (
          <TaskCard
              scope="tasks"
              taskId={task.id}
              title={task.title}
              // This page mixes folders, so a card takes the color of its own folder's root
              // rather than one page-wide category.
              category={getRootCategoryForFolder(folders, task.folderId)}
              folderLabel={folderNameFor(task.folderId)}
            onOpen={() => setOpenTaskId(task.id)}
          />
        )}
      </TaskGridCanvas>
    )

  return (
    // The animation sits on the whole view, header included, so the page arrives as one piece
    // rather than as a list sliding around underneath a stationary title.
    <div
      className={cn('relative flex h-full min-h-0 flex-col', pageEnter.className)}
      style={pageEnter.style}
    >
      <div ref={headerRef} className={FLOATING_HEADER_CLASS}>
        {/* One row: the title and the controls sit side by side, and only the title half rolls
            up on scroll. What matters is *what* COLLAPSIBLE_TITLE_CLASS wraps — it collapses
            everything inside it, so wrapping the whole row (as this page used to) took the New
            Task button away with the title and left an empty bar hovering over the cards. Wrapped
            around the title alone, the row keeps its controls and still gives the height back. */}
        {/* One row, and the two controls sit at opposite ends of it.

            The title is the only thing that moves. It is a flex item with `flex-basis: 0` whose
            `flex-grow` animates between 1 and 0, so on the way down it gives up the whole left
            half of the bar and on the way back it takes it again — and New Task, sitting right
            after it, glides between the two ends under that. The tag menu is pinned to the right
            by `ml-auto`, which claims whatever free space the title has let go of: at grow 1 the
            title has taken it all and the two controls sit together on the right, at grow 0 the
            margin has it all and they are at opposite corners. One animated property, and no
            second copy of either button to cross-fade between.
            (`order` would say this more directly and cannot be animated at all.) */}
        <div className="flex w-full items-center gap-2 sm:gap-3">
          <div
            className={cn(
              COLLAPSIBLE_TITLE_CLASS,
              'min-w-0',
              // Cancels the row gap as the title reaches zero width, so New Task ends up against
              // the bar's own padding rather than a gap's width short of it.
              condensed ? 'max-h-0 -mr-2 opacity-0 sm:-mr-3' : 'max-h-16 opacity-100',
            )}
            style={{ flexGrow: condensed ? 0 : 1, flexBasis: 0 }}
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] sm:h-9 sm:w-9">
                <ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                {/* Sized to the folder view's title rather than a step larger, so moving between
                    the two pages doesn't move the heading. */}
                <h1
                  className="truncate text-[16px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[20px]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Tasks
                </h1>
                <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-text-muted)] sm:text-[12.5px]">
                  Plan, prioritise, and keep your work moving.
                </p>
              </div>
            </div>
          </div>

          {/* Both of these survive scrolling; only where they sit changes. Three separate filter
              controls used to share this row and were the first thing crushed on a narrow
              screen; one pill fits, and the page keeps its single header row. */}
          <Button
            variant="primary"
            size="sm"
            className="h-8 shrink-0 sm:h-9"
            onClick={() => setNewTaskOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New Task
          </Button>
          <div className="ml-auto flex shrink-0 items-center">
            <TaskFilterMenu
              tasks={tasks}
              nowMs={now}
              kind={kindFilter}
              status={statusFilter}
              tag={activeTag}
              tags={allTagsInScope}
              folder={folderFilter}
              folders={folderOptions}
              onKindChange={setKindFilter}
              onStatusChange={setStatusFilter}
              onTagChange={setActiveTag}
              onFolderChange={setFolderFilter}
            />
          </div>
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
            {SECTION_TITLE[statusFilter] ??
              (kindFilter === 'tasks' ? 'Due-date tasks' : kindFilter === 'notes' ? 'Notes' : 'All tasks')}
          </h2>
          {visibleTasks.length === 0 ? (
            <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
              {emptyFilterMessage(
                kindFilter,
                statusFilter,
                'No tasks yet — use New Task to create one in any folder.',
                activeTag,
                folderName,
              )}
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
