import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FolderNode } from '../../types'
import { FolderTreeNode } from './FolderTreeNode'
import { cn } from '../../lib/cn'
import { useFolders } from '../../hooks/useFolders'
import { getFolderCategory } from '../../lib/folderColor'
import './folder-tree.css'

export interface FolderTreeProps {
  folders: FolderNode[]
  selectedId?: string
  expandedIds?: ReadonlySet<string>
  compact?: boolean
  interactive?: boolean
}

export function FolderTree({
  folders,
  selectedId,
  expandedIds: extraExpandedIds,
  compact = false,
  interactive = true,
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
      className={cn('folder-tree', compact ? 'space-y-1' : 'space-y-4')}
      role="tree"
      aria-label="Folder tree"
    >
      {folders.map((folder, index) => (
        <FolderTreeNode
          key={folder.id}
          folder={folder}
          depth={0}
          category={getFolderCategory(index)}
          expandedIds={displayExpandedIds}
          selectedId={selectedId}
          compact={compact}
          interactive={interactive}
          onToggle={toggleFolderExpanded}
          onSelect={(folderId) => navigate(`/folder/${folderId}`)}
        />
      ))}
    </ul>
  )
}
