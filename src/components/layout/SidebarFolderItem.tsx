import { Folder } from 'lucide-react'
import { cn } from '../../lib/cn'
import { StarButton } from '../common/StarButton'
import { useFolders } from '../../hooks/useFolders'
import { SortableFolderRow } from '../folder/SortableFolderRow'

export interface SidebarFolderItemProps {
  folderId: string
  parentId: string | null
  label: string
  important: boolean
  active?: boolean
  onClick?: () => void
}

export function SidebarFolderItem({
  folderId,
  parentId,
  label,
  important,
  active = false,
  onClick,
}: SidebarFolderItemProps) {
  const { toggleFolderImportant } = useFolders()

  return (
    <SortableFolderRow
      folderId={folderId}
      parentId={parentId}
      className={cn(active && 'rounded-md bg-[var(--color-hover)]')}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
          active
            ? 'font-medium text-[var(--color-text)]'
            : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
        )}
      >
        <Folder className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
      <StarButton
        important={important}
        compact
        onToggle={() => toggleFolderImportant(folderId)}
      />
    </SortableFolderRow>
  )
}
