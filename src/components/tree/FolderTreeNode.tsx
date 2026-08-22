import type { CSSProperties } from 'react'
import { ChevronDown, ChevronRight, Folder as FolderIcon } from 'lucide-react'
import type { FolderNode } from '../../types'
import { folderHasChildren } from '../../lib/folders'
import { cn } from '../../lib/cn'
import { StarButton } from '../common/StarButton'
import { FolderActions } from '../folder/FolderActions'
import { SortableFolderRow } from '../folder/SortableFolderRow'
import { useFolders } from '../../hooks/useFolders'
import { categoryVar, type FolderCategory } from '../../lib/folderColor'

export interface FolderTreeNodeProps {
  folder: FolderNode
  depth: number
  category: FolderCategory
  expandedIds: ReadonlySet<string>
  selectedId?: string
  compact?: boolean
  /** Drag-to-reorder, star, and the "…" actions menu only make sense when this tree is a
   * folder-management view. A read-only breadcrumb-style tree (e.g. "Know where you are")
   * has no use for them, and stripping them out is what actually leaves room for the name. */
  interactive?: boolean
  onToggle: (folderId: string) => void
  onSelect: (folderId: string) => void
}

function describeFolder(childCount: number, taskCount: number): string {
  const parts: string[] = []
  if (childCount > 0) {
    parts.push(`${childCount} ${childCount === 1 ? 'subfolder' : 'subfolders'}`)
  }
  parts.push(`${taskCount} ${taskCount === 1 ? 'note' : 'notes'}`)
  return parts.join(' · ')
}

export function FolderTreeNode({
  folder,
  depth,
  category,
  expandedIds,
  selectedId,
  compact = false,
  interactive = true,
  onToggle,
  onSelect,
}: FolderTreeNodeProps) {
  const hasChildren = folderHasChildren(folder)
  const expanded = expandedIds.has(folder.id)
  const selected = selectedId === folder.id
  const { toggleFolderImportant, getTasksInFolder } = useFolders()
  const taskCount = getTasksInFolder(folder.id).length
  const meta = describeFolder(folder.children.length, taskCount)
  const isCard = depth === 0 && !compact

  const toggleButton = hasChildren ? (
    <button
      type="button"
      aria-label={expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
      aria-expanded={expanded}
      onClick={() => onToggle(folder.id)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
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
  )

  const icon = isCard ? (
    <span
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-[var(--shadow-sm)]"
      style={{ background: categoryVar(category, 'soft'), color: categoryVar(category, 'ink') }}
      aria-hidden
    >
      <FolderIcon className="h-[18px] w-[18px]" aria-hidden />
    </span>
  ) : (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        compact ? 'h-5 w-5' : 'h-6 w-6',
      )}
      style={{ background: categoryVar(category, 'soft') }}
      aria-hidden
    >
      <FolderIcon
        className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}
        style={{ color: categoryVar(category) }}
        aria-hidden
      />
    </span>
  )

  const header = (
    <>
      {toggleButton}
      {icon}
      <button
        type="button"
        onClick={() => onSelect(folder.id)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-1.5 text-left transition-colors',
          compact ? 'py-0.5' : 'py-1.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
          selected
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]'
            : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            isCard ? 'text-[15px] font-semibold' : 'text-sm font-medium',
          )}
          style={isCard ? { fontFamily: 'var(--font-display)' } : undefined}
        >
          {folder.name}
        </span>
        {!compact ? (
          <span
            className={cn(
              // shrink-0 here would let this non-essential meta text force the folder's own
              // name toward zero width on a narrow screen — hidden below sm instead, so the
              // name always wins the space fight on mobile.
              'hidden shrink-0 truncate text-[11.5px] sm:inline',
              selected ? 'text-[var(--color-accent-ink)] opacity-80' : 'text-[var(--color-text-muted)]',
            )}
          >
            {meta}
          </span>
        ) : null}
      </button>
      {interactive ? (
        <>
          <StarButton
            important={folder.isImportant}
            compact={!isCard}
            onToggle={() => toggleFolderImportant(folder.id)}
          />
          <FolderActions compact={!isCard} folderId={folder.id} folderName={folder.name} />
        </>
      ) : null}
    </>
  )

  const headerRow = interactive ? (
    <SortableFolderRow folderId={folder.id} parentId={folder.parentId} compact={!isCard}>
      {header}
    </SortableFolderRow>
  ) : (
    <div className="flex w-full items-center gap-0.5">{header}</div>
  )

  const childrenGroup =
    hasChildren && expanded ? (
      <ul
        role="group"
        className="folder-tree-group flex flex-col gap-0.5"
        // `.folder-tree ul { margin: 0; padding: 0 }` is more specific than a plain Tailwind
        // utility class, so it silently wins over pl-*/mt-* classes here — inline styles are
        // the reliable way to actually indent nested levels under that reset.
        //
        // The trunk drops from the center of *this* row's chevron, and each child is indented a
        // further 8px past it so the trunk and its arm land in clear gutter instead of running
        // through the child's drag handle. Chevron centers differ per row type: a card row leads
        // with a 24px handle + 2px gap + 28px chevron (center 40), a nested interactive row with
        // 20 + 2 + 24 (center 34), and a non-interactive row has no handle at all (center 14) —
        // hence indent = center + 8, with the trunk 8px back from it. Kept as tight as the
        // connectors allow: every extra pixel per level is width a deep tree doesn't have.
        style={{
          marginTop: isCard ? 8 : 2,
          paddingLeft: isCard ? 48 : interactive ? 42 : 22,
          '--tree-line-x': '-8px',
          '--tree-elbow-y': compact ? '12px' : '14px',
        } as CSSProperties}
      >
        {folder.children.map((child) => (
          <FolderTreeNode
            key={child.id}
            folder={child}
            depth={depth + 1}
            category={category}
            expandedIds={expandedIds}
            selectedId={selectedId}
            compact={compact}
            interactive={interactive}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
      </ul>
    ) : null

  if (isCard) {
    return (
      <li data-depth={depth}>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)]">
          {headerRow}
          {childrenGroup}
        </div>
      </li>
    )
  }

  return (
    <li data-depth={depth}>
      {headerRow}
      {childrenGroup}
    </li>
  )
}
