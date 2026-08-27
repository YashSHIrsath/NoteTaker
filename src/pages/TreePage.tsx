import { useState } from 'react'
import { FolderTree as FolderTreeIcon, ListTree } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFolders } from '../hooks/useFolders'
import { useServerNowCoarse } from '../hooks/useServerNow'
import { FolderTree } from '../components/tree/FolderTree'
import { TreeStats } from '../components/tree/TreeStats'
import { TreeTaskList } from '../components/tree/TreeTaskList'
import { DeadlineSpotlight } from '../components/task/DeadlineSpotlight'
import { TaskFilterMenu } from '../components/task/TaskFilterMenu'
import { EmptyState } from '../components/common/EmptyState'
import { TaskEditorDialog } from '../components/task/TaskEditorDialog'
import { getImportantFolders } from '../lib/folders'
import {
  applyTaskFilters,
  emptyFilterMessage,
  taskStats,
  type KindFilter,
  type StatusFilter,
} from '../lib/taskFilters'

/**
 * The bird's-eye view — now of the *work*, not only of the filing.
 *
 * The page's order is the order the questions get asked in: what is about to bite me (the
 * spotlight), how am I doing overall (the numbers and the deadline bar), what exactly is in
 * flight (the filtered list), and where does all of it live (the tree). It used to open with four
 * counts, three of which were about how notes were nested — a question the tree underneath
 * already answers in full.
 */
export function TreePage() {
  const { getForest, folders, tasks } = useFolders()
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // The coarse clock: this page filters and counts by lifecycle, and neither needs the
  // once-a-second tick the countdowns inside the rows subscribe to on their own.
  const now = useServerNowCoarse(tasks.some((task) => task.noteKind === 'due_task'))
  const forest = getForest()

  if (forest.length === 0) {
    return (
      <EmptyState
        title="Tree"
        description="Create a folder in Notes to see it here."
      />
    )
  }

  const stats = taskStats(tasks, now)
  const allTagsInScope = Array.from(new Set(tasks.flatMap((task) => task.tags))).sort()
  const byTag = activeTag ? tasks.filter((task) => task.tags.includes(activeTag)) : tasks
  const visibleTasks = applyTaskFilters(byTag, kindFilter, statusFilter, now)

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-0">
        {/* Sticky, not a band above the scroll area: pinned to the top whatever the page does
            around it, and it stays with the content it labels. */}
        <div className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5 sm:gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] sm:h-9 sm:w-9">
              <ListTree className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1
                className="truncate text-[17px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[21px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Tree
              </h1>
              <p className="truncate text-[11.5px] text-[var(--color-text-muted)] sm:text-[12.5px]">
                A bird&rsquo;s-eye view of everything in your workspace
              </p>
            </div>
            {stats.overdue > 0 ? (
              <span
                className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                  color: 'var(--color-danger)',
                }}
              >
                {stats.overdue} overdue
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl px-4 pb-6 sm:px-6 sm:pb-8">
          <div
            className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full opacity-70"
            style={{ background: 'radial-gradient(circle at 30% 30%, var(--color-accent-soft), transparent 70%)' }}
            aria-hidden
          />

          {/* First thing on the page, above the numbers: a count tells you there are three
              overdue tasks, this tells you which one to open. */}
          <DeadlineSpotlight
            tasks={tasks}
            onOpenTask={setOpenTaskId}
            className="relative mt-4"
          />

          <TreeStats
            stats={stats}
            foldersTotal={folders.length}
            rootFolders={forest.length}
            importantFolders={getImportantFolders(folders).length}
            // The cards double as shortcuts into the list below — clicking "Overdue" is the
            // shortest path from "there are four" to "here they are".
            onSelectStatus={(status) => {
              setStatusFilter(status)
              // A status is a question about deadlines, so asking one narrows the kind switch to
              // match; the "Notes" card is the way back out to everything.
              setKindFilter(status === 'all' ? 'all' : 'tasks')
            }}
            className="relative mt-3 sm:mt-4"
          />

          {/* One row for the section: its name, the one filter control, and the way through to
              the full list. The filters used to take a second row of their own here. */}
          <div className="relative mb-2.5 mt-6 flex items-center gap-2">
            <span
              className="text-[14px] font-semibold text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tasks
              <span className="ml-1.5 text-[12px] font-medium tabular-nums text-[var(--color-text-muted)]">
                {visibleTasks.length}
              </span>
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <TaskFilterMenu
                tasks={tasks}
                nowMs={now}
                kind={kindFilter}
                status={statusFilter}
                tag={activeTag}
                tags={allTagsInScope}
                onKindChange={setKindFilter}
                onStatusChange={setStatusFilter}
                onTagChange={setActiveTag}
              />
              <Link
                to="/tasks"
                className="rounded-full px-2 py-1 text-[12.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
              >
                View all
              </Link>
            </div>
          </div>

          <div className="relative mb-6">
            <TreeTaskList
              tasks={visibleTasks}
              nowMs={now}
              onOpenTask={setOpenTaskId}
              emptyMessage={emptyFilterMessage(kindFilter, statusFilter, 'No notes yet.', activeTag)}
            />
          </div>

          <div className="relative mb-3 flex items-center gap-2">
            <FolderTreeIcon className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden />
            <span
              className="text-[14px] font-semibold text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Folder structure
            </span>
            <span className="text-[12px] text-[var(--color-text-muted)]">
              {folders.length} {folders.length === 1 ? 'folder' : 'folders'} · {forest.length} at the root
            </span>
          </div>

          <div className="relative overflow-x-auto">
            <FolderTree folders={forest} />
          </div>
        </div>
      </div>

      {openTaskId ? (
        <TaskEditorDialog taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      ) : null}
    </div>
  )
}
