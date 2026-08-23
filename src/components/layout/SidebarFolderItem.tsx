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

/**
 * A folder nested under the sidebar's Notes row. Deliberately a size down from SidebarSection —
 * smaller type, tighter row, rounded-lg against the parent's rounded-xl — so the nesting is
 * legible from the rows themselves and not only from the rail beside them.
 *
 * The grip only appears on hover here: three permanent columns of grip dots down the sidebar was
 * the single noisiest thing in it, and reordering folders is something you go looking for rather
 * than something the list needs to advertise at rest.
 */
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
      revealHandleOnHover
      className={cn(
        'rounded-lg transition-colors',
        active ? 'bg-[var(--color-accent-soft)]' : 'hover:bg-[var(--color-hover)]',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-lg px-1.5 py-1.5 text-left text-[13px]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/25',
        )}
      >
        {/* The chip's own soft background would be invisible against an active row using the
            same accent-soft color for a folder whose category happens to be indigo (they're
            literally the same CSS variable) — so the active state skips the chip and just
            tints the glyph itself, instead of trying to layer two colored boxes. */}
        {active ? (
          <Folder
            className="h-4 w-4 shrink-0"
            style={{ color: categoryVar(category) }}
            aria-hidden
          />
        ) : (
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
            style={{ background: categoryVar(category, 'soft') }}
            aria-hidden
          >
            <Folder className="h-3 w-3" style={{ color: categoryVar(category) }} aria-hidden />
          </span>
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            active
              ? 'font-semibold text-[var(--color-accent-ink)]'
              : 'text-[var(--color-text)]',
          )}
        >
          {label}
        </span>
      </button>
      <StarButton
        important={important}
        compact
        className="mr-0.5"
        onToggle={() => toggleFolderImportant(folderId)}
      />
    </SortableFolderRow>
  )
}
