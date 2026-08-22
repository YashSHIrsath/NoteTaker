import { useState } from 'react'
import { Folder, ListTree, Star, TreePine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFolders } from '../hooks/useFolders'
import { FolderTree } from '../components/tree/FolderTree'
import { TreeTaskList } from '../components/tree/TreeTaskList'
import { EmptyState } from '../components/common/EmptyState'
import { TaskEditorDialog } from '../components/task/TaskEditorDialog'

export function TreePage() {
  const { getForest, folders, tasks } = useFolders()
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const forest = getForest()

  if (forest.length === 0) {
    return (
      <EmptyState
        title="Tree"
        description="Create a folder in Notes to see it here."
      />
    )
  }

  const foldersTotal = folders.length
  const notesTotal = tasks.length
  const importantTotal =
    folders.filter((folder) => folder.isImportant).length +
    tasks.filter((task) => task.isImportant).length

  const stats = [
    { label: 'Folders total', value: foldersTotal, icon: Folder, category: 'indigo' as const },
    { label: 'Notes total', value: notesTotal, icon: ListTree, category: 'teal' as const },
    { label: 'Marked important', value: importantTotal, icon: Star, category: 'rose' as const },
    { label: 'Root folders', value: forest.length, icon: TreePine, category: 'amber' as const },
  ]

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
          </div>
        </div>

        <div className="relative mx-auto max-w-5xl px-4 pb-6 sm:px-6 sm:pb-8">
          <div
            className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full opacity-70"
            style={{ background: 'radial-gradient(circle at 30% 30%, var(--color-accent-soft), transparent 70%)' }}
            aria-hidden
          />

          <div className="relative mb-6 grid grid-cols-2 gap-2.5 pt-4 sm:grid-cols-4 sm:gap-4">
            {stats.map(({ label, value, icon: Icon, category }) => (
              <div
                key={label}
                className="flex flex-col gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)] sm:gap-2.5 sm:p-4"
              >
                <span
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:h-8 sm:w-8"
                  style={{ background: `var(--cat-${category}-soft)`, color: `var(--cat-${category})` }}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </span>
                <span
                  className="text-xl font-semibold text-[var(--color-text)] sm:text-2xl"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {value}
                </span>
                <span className="text-[11.5px] font-medium text-[var(--color-text-muted)] sm:text-[12.5px]">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="relative mb-3 flex items-center justify-between gap-3">
            <span className="text-[14px] font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
              Tasks
            </span>
            <Link
              to="/tasks"
              className="rounded-full px-2 py-1 text-[12.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
            >
              View all
            </Link>
          </div>

          <div className="relative mb-6">
            <TreeTaskList tasks={tasks} onOpenTask={setOpenTaskId} />
          </div>

          <div className="relative mb-3 flex items-center justify-between">
            <span className="text-[14px] font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
              Folder structure
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
