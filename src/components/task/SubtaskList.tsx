import type { Subtask } from '../../types'
import { getChildSubtasks } from '../../lib/subtasks'
import { SubtaskItem } from './SubtaskItem'

export interface SubtaskListProps {
  parentSubtaskId: string | null
  allSubtasks: Subtask[]
  expandedIds: ReadonlySet<string>
  onToggleExpand: (subtaskId: string) => void
  onToggleCompleted: (subtaskId: string) => void
  onAddChild?: (parentSubtaskId: string) => void
  onRename?: (subtaskId: string, title: string) => void
  onDelete?: (subtaskId: string) => void
}

export function SubtaskList({
  parentSubtaskId,
  allSubtasks,
  expandedIds,
  onToggleExpand,
  onToggleCompleted,
  onAddChild,
  onRename,
  onDelete,
}: SubtaskListProps) {
  const items = getChildSubtasks(allSubtasks, parentSubtaskId)

  if (items.length === 0) {
    return null
  }

  return (
    <ul
      className={
        parentSubtaskId ? 'ml-4 border-l border-[var(--color-border)] pl-1' : 'space-y-0.5'
      }
    >
      {items.map((subtask) => (
        <SubtaskItem
          key={subtask.id}
          subtask={subtask}
          allSubtasks={allSubtasks}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          onToggleCompleted={onToggleCompleted}
          onAddChild={onAddChild}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}
