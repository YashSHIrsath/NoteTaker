import type { ReactNode } from 'react'
import { SortableRow } from '../dnd/SortableRow'
import { useFolders } from '../../hooks/useFolders'

export interface SortableFolderRowProps {
  folderId: string
  parentId: string | null
  compact?: boolean
  className?: string
  /** See SortableRow: hides the grip until the row is hovered/focused. */
  revealHandleOnHover?: boolean
  children: ReactNode
}

export function SortableFolderRow({
  folderId,
  parentId,
  compact = false,
  className,
  revealHandleOnHover = false,
  children,
}: SortableFolderRowProps) {
  const { reorderSiblingFolders } = useFolders()

  return (
    <SortableRow
      kind="folder"
      itemId={folderId}
      groupId={parentId}
      compact={compact}
      className={className}
      revealHandleOnHover={revealHandleOnHover}
      dragLabel="Drag to reorder folder"
      onReorder={reorderSiblingFolders}
    >
      {children}
    </SortableRow>
  )
}
