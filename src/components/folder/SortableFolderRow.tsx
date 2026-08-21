import type { ReactNode } from 'react'
import { SortableRow } from '../dnd/SortableRow'
import { useFolders } from '../../hooks/useFolders'

export interface SortableFolderRowProps {
  folderId: string
  parentId: string | null
  compact?: boolean
  className?: string
  children: ReactNode
}

export function SortableFolderRow({
  folderId,
  parentId,
  compact = false,
  className,
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
      dragLabel="Drag to reorder folder"
      onReorder={reorderSiblingFolders}
    >
      {children}
    </SortableRow>
  )
}
