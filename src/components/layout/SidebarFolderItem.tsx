import { Folder } from 'lucide-react'
import { cn } from '../../lib/cn'
import { StarButton } from '../common/StarButton'
import { useFolders } from '../../hooks/useFolders'
import { SortableFolderRow } from '../folder/SortableFolderRow'
import { categoryVar, type FolderCategory } from '../../lib/folderColor'

export interface SidebarFolderItemProps {
  folderId: string
  parentId: string | null
  label: string
  important: boolean
  category: FolderCategory
  active?: boolean
  onClick?: () => void
}

export function SidebarFolderItem({
  folderId,
  parentId,
  label,
  important,
  category,
  active = false,
  onClick,
}: SidebarFolderItemProps) {
  const { toggleFolderImportant } = useFolders()

  return (
    <SortableFolderRow
      folderId={folderId}
      parentId={parentId}
      compact
      className={cn(active && 'rounded-full bg-[var(--color-accent-soft)]')}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-full px-1.5 py-1.5 text-left text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
          active
            ? 'font-semibold text-[var(--color-accent-ink)]'
            : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
        )}
      >
        {/* The chip's own soft background would be invisible against an active row using the
            same accent-soft color for a folder whose category happens to be indigo (they're
            literally the same CSS variable) — so the active state skips the chip and just
            tints the glyph itself, instead of trying to layer two colored boxes. */}
        {active ? (
          <Folder
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: categoryVar(category) }}
            aria-hidden
          />
        ) : (
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ background: categoryVar(category, 'soft') }}
            aria-hidden
          >
            <Folder className="h-3 w-3" style={{ color: categoryVar(category) }} aria-hidden />
          </span>
        )}
        <span className="truncate">{label}</span>
      </button>
      <StarButton
        important={important}
        compact
        className="mr-1"
        onToggle={() => toggleFolderImportant(folderId)}
      />
    </SortableFolderRow>
  )
}
