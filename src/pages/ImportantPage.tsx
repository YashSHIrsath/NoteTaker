import { useState, type CSSProperties } from 'react'
import { FileText, Folder } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { StarButton } from '../components/common/StarButton'
import { RowDeleteButton } from '../components/common/RowDeleteButton'
import { FolderActions } from '../components/folder/FolderActions'
import { AllTaskTile } from '../components/task/AllTaskTile'
import { TaskFilterMenu } from '../components/task/TaskFilterMenu'
import { TaskGridCanvas } from '../components/task/TaskGridCanvas'
import { TaskEditorDialog } from '../components/task/TaskEditorDialog'
import { useAuth } from '../hooks/useAuth'
import { useDeleteTask } from '../hooks/useDeleteTask'
import { useFolders } from '../hooks/useFolders'
import { useServerNowCoarse } from '../hooks/useServerNow'
import { folderPathLabel, getImportantFolders } from '../lib/folders'
import { getImportantTasks } from '../lib/tasks'
import {
  applyTaskFilters,
  emptyFilterMessage,
  type KindFilter,
  type StatusFilter,
} from '../lib/taskFilters'
import { categoryVar, getRootCategoryForFolder, scatterCategoryForId } from '../lib/folderColor'
import { taskColorStyle } from '../lib/taskColor'
import { readViewStyle } from '../lib/viewStyle'
import { usePageEnter } from '../hooks/usePageEnterDirection'
import { cn } from '../lib/cn'
import { performWithTaskExit } from '../lib/taskExitAnimation'
import { useFloatingHeader } from '../hooks/useFloatingHeader'

const CARD_GRID = 'mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3'
// Same width rule as the task tiles: rows only split into columns once each one has room.
const FOLDER_GRID =
  'mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2.5 sm:gap-3'
const CARD_BASE =
  'anim-item-in group relative flex items-center gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-2.5 transition-all hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)] sm:gap-3 sm:p-3'
const CARD_ACTIONS = 'flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'

/**
 * The two halves of this page, in the order the switch shows them.
 *
 * Order is not decoration here: it decides which way the panes travel. Moving to a tab further
 * right slides the incoming pane in from the right, and back the other way for the left — the
 * switch and the content agree about which direction you just went.
 */
const TABS = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'folders', label: 'Folders' },
] as const

type ImportantTab = (typeof TABS)[number]['key']

/** How far a pane travels on the way in. Far enough to read as a direction, near enough that it
 *  is the same content arriving rather than a different screen being pushed in. */
const PANE_TRAVEL = 28

export function ImportantPage() {
  const navigate = useNavigate()
  const { folders, tasks, toggleFolderImportant, toggleTaskImportant } = useFolders()
  const { requestTaskDelete, dialog } = useDeleteTask()
  const { user } = useAuth()
  const viewStyle = readViewStyle(user?.user_metadata as Record<string, unknown> | undefined)
  const [tab, setTab] = useState<ImportantTab>('tasks')
  // Which way the next pane arrives from. Held in state rather than derived, because by the time
  // the new pane renders the tab it came from is gone.
  const [paneTravel, setPaneTravel] = useState(0)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const { headerRef, contentRef } = useFloatingHeader()
  // Which side this whole view slides in from — the side of the bar you came from.
  const pageEnter = usePageEnter()
  const importantFolders = getImportantFolders(folders)
  const importantTasks = getImportantTasks(tasks)
  // Coarse: the status filter needs the clock, and the whole card list re-renders with it.
  const now = useServerNowCoarse(importantTasks.some((task) => task.noteKind === 'due_task'))
  const allTagsInScope = Array.from(new Set(importantTasks.flatMap((task) => task.tags))).sort()
  const byTag = activeTag
    ? importantTasks.filter((task) => task.tags.includes(activeTag))
    : importantTasks
  const visibleImportantTasks = applyTaskFilters(byTag, kindFilter, statusFilter, now)

  const removeTaskFromImportant = (taskId: string) => {
    void performWithTaskExit(taskId, () => toggleTaskImportant(taskId))
  }

  const tabIndex = TABS.findIndex((item) => item.key === tab)

  const selectTab = (next: ImportantTab) => {
    if (next === tab) {
      return
    }
    const forward = TABS.findIndex((item) => item.key === next) > tabIndex
    setPaneTravel(forward ? PANE_TRAVEL : -PANE_TRAVEL)
    setTab(next)
  }

  return (
    // The animation sits on the whole view, header included, so the page arrives as one piece
    // rather than as a list sliding around underneath a stationary title.
    <div
      className={cn('relative flex h-full min-h-0 flex-col', pageEnter.className)}
      style={pageEnter.style}
    >
      {/* No title row, and therefore nothing that collapses on scroll. The switch was previously
          inside the collapsing wrapper together with the heading, so scrolling took the only
          control on the page away with the words and left a blank bar hovering over the cards —
          the same mistake the Tasks page header carries a note about. A bar that overlays content
          has to keep earning its height; a switch does, a read heading doesn't. */}
      {/* The switch *is* the bar. The shared FLOATING_HEADER_CLASS is a full-width card sized for
          a title, a subtitle and controls; with nothing in it but a 240px switch it was mostly
          empty space with a border round it, and the switch's own pill inside made it two nested
          rounded boxes saying one thing. Hugging its content is `w-fit` plus auto margins, which
          centre a box between the two insets — the same rule that decides where the bottom bar
          sits, rather than a transform. */}
      <div
        ref={headerRef}
        className={cn(
          'absolute inset-x-4 top-3 z-20 mx-auto w-fit shrink-0 sm:inset-x-6 sm:top-4',
          // From lg this stops being a pill hovering over the content and becomes the page's
          // header band — full width, on the surface, ruled off from the content below it, and
          // carrying the filter pill alongside the switch.
          //
          // Floating suits a phone: the bar is the only thing on its layer, cards scroll under it,
          // and centring it lets them pass either side. On a desktop the same pill was a lone
          // control adrift at the top of an empty line, with the filters stranded a hundred pixels
          // below it and nothing tying either to the page. Every other page here opens with a
          // band; this one now does too.
          'lg:static lg:mx-0 lg:w-auto lg:border-b lg:border-[var(--color-border)]',
          'lg:bg-[var(--color-surface)] lg:px-6 lg:py-3',
        )}
      >
        <div className="flex w-full items-center justify-center lg:justify-between lg:gap-4">
          <div
            role="tablist"
            aria-label="Starred"
            className={cn(
              // h-9 on both this and the filter beside it: the two used to size themselves from
              // their own contents — a line-height here, a button height there — and landed a few
              // pixels apart, which on two pills side by side is all it takes to look wrong.
              'relative inline-flex h-9 items-center rounded-full p-1',
              // The floating-surface treatment the bar used to carry, now on the only thing left.
              'border border-[var(--color-border)]/60 bg-[var(--color-surface)]/70 backdrop-blur-md',
              'shadow-[var(--shadow-md)] supports-[backdrop-filter:blur(0px)]:bg-[var(--color-surface)]/80',
              // And dropped again from lg, where it sits in the page rather than above it: a
              // shadow and a blur with nothing passing underneath is a control pretending to
              // hover. Plain track and border there, like the folder view's List/Board toggle.
              'lg:border-[var(--color-border)] lg:bg-[var(--color-hover)] lg:shadow-none lg:backdrop-blur-none',
            )}
          >
            {/* One pill that travels, rather than a background on whichever tab is active: with
                two equal-width tabs `translateX(index * 100%)` is exact, and a single moving
                element is what lets the switch itself show the direction the panes are about to
                take. Same trick as the bottom bar's indicator. */}
            <span
              aria-hidden
              className={cn(
                'absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full',
                'bg-[var(--color-surface-raised)] shadow-[var(--shadow-sm)]',
                'transition-transform duration-[320ms] [transition-timing-function:var(--motion-spring)]',
                'motion-reduce:transition-none',
              )}
              style={{ transform: `translateX(${tabIndex * 100}%)` }}
            />
            {TABS.map((item) => {
              const count = item.key === 'tasks' ? importantTasks.length : importantFolders.length
              const active = tab === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectTab(item.key)}
                  className={cn(
                    'anim-press relative z-10 h-full w-[104px] rounded-full px-3 text-[12.5px] font-semibold',
                    'transition-colors duration-200 sm:w-[120px]',
                    active ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]',
                  )}
                >
                  {item.label}
                  <span className="ml-1 text-[11px] font-medium opacity-70">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Filtering belongs to the tasks half; a folder has no kind, no deadline and no tags,
              so on that tab the control would narrow something that isn't on screen.

              The wrapper carries the same floating-surface treatment as the switch beside it,
              because below lg this bar is transparent and the cards scroll underneath: an
              outlined pill with nothing behind it would have note titles running through it. */}
          {tab === 'tasks' ? (
            <div
              className={cn(
                'ml-1.5 inline-flex h-9 shrink-0 items-center rounded-full p-1',
                'border border-[var(--color-border)]/60 bg-[var(--color-surface)]/70 backdrop-blur-md',
                'shadow-[var(--shadow-md)] supports-[backdrop-filter:blur(0px)]:bg-[var(--color-surface)]/80',
                'lg:ml-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none',
              )}
            >
              <TaskFilterMenu
                tasks={importantTasks}
                nowMs={now}
                kind={kindFilter}
                status={statusFilter}
                tag={activeTag}
                tags={allTagsInScope}
                onKindChange={setKindFilter}
                onStatusChange={setStatusFilter}
                onTagChange={setActiveTag}
                size="fill"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface-muted)] px-4 pb-28 sm:px-6 lg:pb-6"
      >
        {/* One pane at a time, remounted on every switch so its arrival animation replays.
            `anim-page-enter` is the same slide the whole app uses when you move along the bottom
            bar, pointed at whichever direction the switch just went — which is what makes the
            two read as one gesture rather than a control and an unrelated redraw. */}
        <div
          key={tab}
          className="anim-page-enter"
          style={{ '--page-enter-x': `${paneTravel}px` } as CSSProperties}
        >
        {tab === 'folders' ? (
        <section className="mt-3 sm:mt-4 lg:mt-4">
          {importantFolders.length === 0 ? (
            <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
              Nothing starred yet — star a folder to keep it here.
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
        ) : (
        <section className="mt-3 sm:mt-4 lg:mt-4">

          {visibleImportantTasks.length === 0 ? (
            <p className="mt-2 px-2.5 text-sm text-[var(--color-text-muted)]">
              {emptyFilterMessage(
                kindFilter,
                statusFilter,
                'Nothing starred yet — star a task to keep it here.',
                activeTag,
              )}
            </p>
          ) : viewStyle === 'clipboard' ? (
            <TaskGridCanvas
              tasks={visibleImportantTasks}
              scope="important"
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
        )}
        </div>
      </div>

      {dialog}
      {openTaskId ? (
        <TaskEditorDialog taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      ) : null}
    </div>
  )
}
