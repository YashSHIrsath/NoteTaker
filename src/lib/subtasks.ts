import type { Subtask } from '../types'

export function getSubtasksByTask(subtasks: Subtask[], taskId: string): Subtask[] {
  return subtasks.filter((subtask) => subtask.taskId === taskId)
}

export function getChildSubtasks(
  subtasks: Subtask[],
  parentSubtaskId: string | null,
): Subtask[] {
  return subtasks.filter((subtask) => subtask.parentSubtaskId === parentSubtaskId)
}

export function collectSubtaskAncestorIds(subtasks: Subtask[], rootId: string): string[] {
  const byId = new Map(subtasks.map((item) => [item.id, item]))
  const ids: string[] = []
  let current = byId.get(rootId)
  while (current?.parentSubtaskId) {
    ids.unshift(current.parentSubtaskId)
    current = byId.get(current.parentSubtaskId)
  }
  return ids
}

export function collectSubtaskSubtreeIds(subtasks: Subtask[], rootId: string): string[] {
  const ids = [rootId]
  for (const child of getChildSubtasks(subtasks, rootId)) {
    ids.push(...collectSubtaskSubtreeIds(subtasks, child.id))
  }
  return ids
}
