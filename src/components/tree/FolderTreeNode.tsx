import { ChevronDown, ChevronRight, Folder } from 'lucide-react'
import type { FolderNode } from '../../types'
import { folderHasChildren } from '../../lib/folders'
import { cn } from '../../lib/cn'
import { StarButton } from '../common/StarButton'
import { FolderActions } from '../folder/FolderActions'
import { SortableFolderRow } from '../folder/SortableFolderRow'
import { useFolders } from '../../hooks/useFolders'

export interface FolderTreeNodeProps {
  folder: FolderNode
  depth: number
  isLast: boolean
  expandedIds: ReadonlySet<string>
  selectedId?: string
  compact?: boolean
  onToggle: (folderId: string) => void
  onSelect: (folderId: string) => void
}

export function FolderTreeNode({
  folder,
  depth,
  isLast,
  expandedIds,
  selectedId,
  compact = false,
  onToggle,
  onSelect,
}: FolderTreeNodeProps) {
  const hasChildren = folderHasChildren(folder)
  const expanded = expandedIds.has(folder.id)
  const selected = selectedId === folder.id
  const { toggleFolderImportant } = useFolders()

  return (
    <li
      data-depth={depth}
      className={cn(depth > 0 && 'tree-branch', depth > 0 && isLast && 'tree-branch-last')}
    >
      <SortableFolderRow folderId={folder.id} parentId={folder.parentId} compact={compact}>
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            aria-expanded={expanded}
            onClick={() => onToggle(folder.id)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-md',
              compact ? 'h-6 w-6' : 'h-7 w-7',
              'text-[var(--color-text-muted)] transition-colors',
              'hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
            )}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : (
          <span className={cn('inline-flex shrink-0', compact ? 'h-6 w-6' : 'h-7 w-7')} aria-hidden />
        )}

        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-sm transition-colors',
            compact ? 'py-0.5' : 'py-1',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
            selected
              ? 'bg-[var(--color-hover)] font-medium text-[var(--color-text)]'
              : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
          )}
        >
          <Folder className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
          <span className="truncate">{folder.name}</span>
        </button>
        <StarButton
          important={folder.isImportant}
          compact={compact}
          onToggle={() => toggleFolderImportant(folder.id)}
        />
        <FolderActions compact={compact} folderId={folder.id} folderName={folder.name} />
      </SortableFolderRow>

      {hasChildren && expanded ? (
        <ul role="group">
          {folder.children.map((child, index) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              isLast={index === folder.children.length - 1}
              expandedIds={expandedIds}
              selectedId={selectedId}
              compact={compact}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
