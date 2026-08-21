import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { Subtask } from '../../types'
import { getChildSubtasks } from '../../lib/subtasks'
import { cn } from '../../lib/cn'
import { SubtaskList } from './SubtaskList'
import { Button } from '../ui/Button'

export interface SubtaskItemProps {
  subtask: Subtask
  allSubtasks: Subtask[]
  expandedIds: ReadonlySet<string>
  onToggleExpand: (subtaskId: string) => void
  onToggleCompleted: (subtaskId: string) => void
  onAddChild?: (parentSubtaskId: string) => void
  onRename?: (subtaskId: string, title: string) => void
  onDelete?: (subtaskId: string) => void
}

export function SubtaskItem({
  subtask,
  allSubtasks,
  expandedIds,
  onToggleExpand,
  onToggleCompleted,
  onAddChild,
  onRename,
  onDelete,
}: SubtaskItemProps) {
  const children = getChildSubtasks(allSubtasks, subtask.id)
  const hasChildren = children.length > 0
  const expanded = expandedIds.has(subtask.id)

  return (
        <li id={`subtask-${subtask.id}`}>
      <div className="flex items-center gap-0.5">
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${subtask.title}` : `Expand ${subtask.title}`}
            aria-expanded={expanded}
            onClick={() => onToggleExpand(subtask.id)}
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
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
          <span className="inline-flex h-7 w-7 shrink-0" aria-hidden />
        )}

        <input
          type="checkbox"
          checked={subtask.completed}
          onChange={() => onToggleCompleted(subtask.id)}
          aria-label={`Mark ${subtask.title || 'subtask'} complete`}
          className="h-3.5 w-3.5 shrink-0 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
        />

        {onRename ? (
          <input
            value={subtask.title}
            onChange={(event) => onRename(subtask.id, event.target.value)}
            onBlur={() => {
              if (!subtask.title.trim()) {
                onRename(subtask.id, 'Untitled')
              }
            }}
            aria-label="Subtask title"
            className={cn(
              'min-w-0 flex-1 bg-transparent px-1 py-1 text-sm outline-none',
              subtask.completed
                ? 'text-[var(--color-text-muted)] line-through'
                : 'text-[var(--color-text)]',
            )}
          />
        ) : (
          <span
            className={cn(
              'min-w-0 flex-1 truncate px-1 py-1 text-sm',
              subtask.completed
                ? 'text-[var(--color-text-muted)] line-through'
                : 'text-[var(--color-text)]',
            )}
          >
            {subtask.title || 'Untitled'}
          </span>
        )}

        {onAddChild ? (
          <button
            type="button"
            onClick={() => onAddChild(subtask.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs',
              'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
            )}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Add Subtask</span>
          </button>
        ) : null}

        {onDelete ? (
          <Button variant="ghost" size="sm" onClick={() => onDelete(subtask.id)}>
            Remove
          </Button>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <SubtaskList
          parentSubtaskId={subtask.id}
          allSubtasks={allSubtasks}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onToggleCompleted={onToggleCompleted}
          onAddChild={onAddChild}
          onRename={onRename}
          onDelete={onDelete}
        />
      ) : null}
    </li>
  )
}
