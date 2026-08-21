import { Folder } from 'lucide-react'
import { cn } from '../../lib/cn'
import { StarButton } from '../common/StarButton'
import { FolderActions } from './FolderActions'
import { useFolders } from '../../hooks/useFolders'
import { SortableFolderRow } from './SortableFolderRow'

export interface FolderItemProps {
  folderId: string
  parentId: string | null
  name: string
  important: boolean
  onClick: () => void
  sortable?: boolean
}

export function FolderItem({
  folderId,
  parentId,
  name,
  important,
  onClick,
  sortable = true,
}: FolderItemProps) {
  const { toggleFolderImportant } = useFolders()

  const content = (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm',
          'text-[var(--color-text)] transition-colors',
          'hover:bg-[var(--color-hover)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        )}
      >
        <Folder className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        <span className="truncate">{name}</span>
      </button>
      <StarButton
        important={important}
        onToggle={() => toggleFolderImportant(folderId)}
      />
      <FolderActions folderId={folderId} folderName={name} />
    </>
  )

  if (!sortable) {
    return <div className="flex w-full items-center gap-0.5">{content}</div>
  }

  return (
    <SortableFolderRow folderId={folderId} parentId={parentId}>
      {content}
    </SortableFolderRow>
  )
}
