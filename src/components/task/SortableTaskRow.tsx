import type { ReactNode } from 'react'
import { SortableRow } from '../dnd/SortableRow'
import { useFolders } from '../../hooks/useFolders'

export interface SortableTaskRowProps {
  taskId: string
  folderId: string
  className?: string
  children: ReactNode
}

export function SortableTaskRow({
  taskId,
  folderId,
  className,
  children,
}: SortableTaskRowProps) {
  const { reorderSiblingTasks } = useFolders()

  return (
    <SortableRow
      kind="task"
      itemId={taskId}
      groupId={folderId}
      className={className}
      dragLabel="Drag to reorder task"
      onReorder={reorderSiblingTasks}
    >
      {children}
    </SortableRow>
  )
}
