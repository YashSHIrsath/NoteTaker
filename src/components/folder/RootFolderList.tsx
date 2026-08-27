import { AlarmClock, Clock, Folder as FolderIcon, FolderPlus } from 'lucide-react'
import type { Folder } from '../../types'
import { StarButton } from '../common/StarButton'
import { FolderActions } from './FolderActions'
import { SortableFolderRow } from './SortableFolderRow'
import { useFolders } from '../../hooks/useFolders'
import { useServerNowCoarse } from '../../hooks/useServerNow'
import { categoryVar, getFolderCategory, type FolderCategory } from '../../lib/folderColor'
import { folderSummary, type FolderSummary } from '../../lib/taskFilters'
import { cn } from '../../lib/cn'

/**
 * The Notes page's list of root folders.
 *
 * These were single-line rows — a small glyph, a name, a star, a menu — which made the page a
 * list of words. Everything you would actually choose a folder by (how much is in it, whether
 * anything in it is late) existed already and was only visible once you were inside. A row is now
 * a card that says it, and the page has something on it above the fold.
 *
 * Still one row per folder rather than a grid, because these rows are draggable: reordering reads
 * as up and down, and a grid turns one axis of ordering into two.
 */

export interface RootFolderListProps {
  folders: Folder[]
  onOpenFolder: (folderId: string) => void
  /** Renders the dashed tile that closes the list. Omitted, the list just ends. */
  onCreateFolder?: () => void
}

/** The counts under the name, and the two of them that are worth a colour. */
function FolderMeta({ summary }: { summary: FolderSummary }) {
  const counts: string[] = []
  if (summary.subfolders > 0) {
    counts.push(`${summary.subfolders} ${summary.subfolders === 1 ? 'subfolder' : 'subfolders'}`)
  }
  counts.push(`${summary.notes} ${summary.notes === 1 ? 'note' : 'notes'}`)

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] leading-snug text-[var(--color-text-muted)]">
      <span className="truncate">{counts.join(' · ')}</span>
      {summary.overdue > 0 ? (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10.5px] font-semibold"
          style={{
            background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
            color: 'var(--color-danger)',
          }}
        >
          <AlarmClock className="h-2.5 w-2.5" aria-hidden />
          {summary.overdue} overdue
        </span>
      ) : null}
      {summary.dueSoon > 0 ? (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[10.5px] font-semibold"
          style={{ background: 'var(--task-amber-card)', color: 'var(--task-amber-ink)' }}
        >
          <Clock className="h-2.5 w-2.5" aria-hidden />
          {summary.dueSoon} due soon
        </span>
      ) : null}
    </span>
  )
}

function RootFolderRow({
  folder,
  category,
  summary,
  onOpen,
}: {
  folder: Folder
  category: FolderCategory
  summary: FolderSummary
  onOpen: () => void
}) {
  const { toggleFolderImportant } = useFolders()

  return (
    <SortableFolderRow
      folderId={folder.id}
      parentId={null}
      compact
      revealHandleOnHover
      className={cn(
        'border-[var(--color-border)] bg-[var(--color-surface-raised)] px-1.5 shadow-[var(--shadow-sm)]',
        'hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)]',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'anim-press flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-xl px-1.5 py-1.5 text-left',
          'transition-colors hover:bg-[var(--color-hover)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        )}
      >
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: categoryVar(category, 'soft') }}
          aria-hidden
        >
          <FolderIcon
            className="h-[17px] w-[17px]"
            style={{ color: categoryVar(category) }}
            aria-hidden
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-semibold leading-snug text-[var(--color-text)]">
            {folder.name}
          </span>
          <FolderMeta summary={summary} />
        </span>
      </button>
      <StarButton
        important={folder.isImportant}
        compact
        className="shrink-0"
        onToggle={() => toggleFolderImportant(folder.id)}
      />
      <FolderActions folderId={folder.id} folderName={folder.name} />
    </SortableFolderRow>
  )
}

export function RootFolderList({ folders, onOpenFolder, onCreateFolder }: RootFolderListProps) {
  const { folders: allFolders, tasks } = useFolders()
  // Coarse: "overdue" and "due soon" are lifecycle questions, and nothing in this list counts
  // down, so there is nothing here worth re-rendering once a second for.
  const now = useServerNowCoarse(tasks.some((task) => task.noteKind === 'due_task'))

  return (
    <ul className="flex flex-col gap-1.5">
      {folders.map((folder, index) => (
        <li key={folder.id}>
          <RootFolderRow
            folder={folder}
            category={getFolderCategory(index)}
            summary={folderSummary(allFolders, tasks, folder.id, now)}
            onOpen={() => onOpenFolder(folder.id)}
          />
        </li>
      ))}

      {/* The list's own last row rather than a button stranded up in the header: with two folders
          in an account, this page was a short list above a screenful of nothing, and the one
          thing to do next was off at the top of it. */}
      {onCreateFolder ? (
        <li>
          <button
            type="button"
            onClick={onCreateFolder}
            className={cn(
              'anim-press flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-[var(--color-border-strong)] px-3 py-2.5 text-left',
              'text-[var(--color-text-muted)] transition-colors',
              'hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
            )}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-current opacity-70">
              <FolderPlus className="h-[17px] w-[17px]" aria-hidden />
            </span>
            <span className="text-[13.5px] font-semibold">New folder</span>
          </button>
        </li>
      ) : null}
    </ul>
  )
}
