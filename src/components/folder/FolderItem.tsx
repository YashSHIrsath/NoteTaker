import { Folder } from 'lucide-react'
import { cn } from '../../lib/cn'
import { StarButton } from '../common/StarButton'
import { FolderActions } from './FolderActions'
import { useFolders } from '../../hooks/useFolders'
import { SortableFolderRow } from './SortableFolderRow'
import { VisibilityBadge } from '../sharing/VisibilityBadge'
import { folderChainVisibility, ownVisibility } from '../../lib/contentPrivacy'
import { categoryVar, type FolderCategory } from '../../lib/folderColor'

export interface FolderItemProps {
  folderId: string
  parentId: string | null
  name: string
  important: boolean
  category?: FolderCategory
  onClick: () => void
  sortable?: boolean
}

export function FolderItem({
  folderId,
  parentId,
  name,
  important,
  category = 'indigo',
  onClick,
  sortable = true,
}: FolderItemProps) {
  const { toggleFolderImportant, folders, sharingIndex } = useFolders()

  /*
   * What this folder actually reaches, not what it is set to.
   *
   * A folder marked Everyone inside a private one reaches exactly its owner, and the badge has to say
   * so — the alternative is an interface that reports a setting while the system does something else.
   * `narrowed` is what separates "I chose this" from "the folder above me decided it", which is the
   * difference between a badge that explains and a badge that confuses.
   */
  const own = ownVisibility(sharingIndex, 'folder', folderId)
  const effective = folderChainVisibility(sharingIndex, folders, folderId)

  const content = (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'anim-press flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-full px-2.5 py-1.5 text-left text-sm',
          'text-[var(--color-text)] transition-colors',
          'hover:bg-[var(--color-hover)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        )}
      >
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: categoryVar(category, 'soft') }}
          aria-hidden
        >
          <Folder className="h-3.5 w-3.5" style={{ color: categoryVar(category) }} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <VisibilityBadge visibility={effective} narrowedByParent={own !== effective} />
      </button>
      <StarButton
        important={important}
        compact
        className="shrink-0"
        onToggle={() => toggleFolderImportant(folderId)}
      />
      <FolderActions folderId={folderId} folderName={name} />
    </>
  )

  if (!sortable) {
    return <div className="anim-item-in flex w-full items-center gap-0.5">{content}</div>
  }

  return (
    <SortableFolderRow
      folderId={folderId}
      parentId={parentId}
      compact
      revealHandleOnHover
    >
      {content}
    </SortableFolderRow>
  )
}
