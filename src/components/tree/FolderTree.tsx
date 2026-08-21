import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FolderNode } from '../../types'
import { FolderTreeNode } from './FolderTreeNode'
import { cn } from '../../lib/cn'
import { useFolders } from '../../hooks/useFolders'
import './folder-tree.css'

export interface FolderTreeProps {
  folders: FolderNode[]
  selectedId?: string
  expandedIds?: ReadonlySet<string>
  compact?: boolean
}

export function FolderTree({
  folders,
  selectedId,
  expandedIds: extraExpandedIds,
  compact = false,
}: FolderTreeProps) {
  const navigate = useNavigate()
  const { uiState, toggleFolderExpanded } = useFolders()

  const extraExpandedKey = extraExpandedIds
    ? Array.from(extraExpandedIds).join('|')
    : ''

  const displayExpandedIds = useMemo(() => {
    const next = new Set(uiState.expandedFolderIds)
    if (extraExpandedKey) {
      extraExpandedKey.split('|').forEach((id) => next.add(id))
    }
    return next
  }, [uiState.expandedFolderIds, extraExpandedKey])

  return (
    <ul
      className={cn('folder-tree', compact ? 'folder-tree-compact space-y-1' : 'space-y-5')}
      role="tree"
      aria-label="Folder tree"
    >
      {folders.map((folder) => (
        <FolderTreeNode
          key={folder.id}
          folder={folder}
          depth={0}
          isLast
          expandedIds={displayExpandedIds}
          selectedId={selectedId}
          compact={compact}
          onToggle={toggleFolderExpanded}
          onSelect={(folderId) => navigate(`/folder/${folderId}`)}
        />
      ))}
    </ul>
  )
}
