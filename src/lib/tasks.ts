import type { Task } from '../types'

export function compareTasksBySortOrder(a: Task, b: Task): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder
  }
  return a.id.localeCompare(b.id)
}

export function getTaskById(tasks: Task[], id: string): Task | undefined {
  return tasks.find((task) => task.id === id)
}

/** Direct child tasks of a folder, ordered among siblings. */
export function getTasksByFolder(tasks: Task[], folderId: string): Task[] {
  return tasks
    .filter((task) => task.folderId === folderId)
    .slice()
    .sort(compareTasksBySortOrder)
}

export function collectTaskIdsInFolders(tasks: Task[], folderIds: Iterable<string>): string[] {
  const folders = new Set(folderIds)
  return tasks.filter((task) => folders.has(task.folderId)).map((task) => task.id)
}

export function getImportantTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.isImportant)
}

export function nextTaskSortOrder(tasks: Task[], folderId: string): number {
  const siblings = getTasksByFolder(tasks, folderId)
  if (siblings.length === 0) {
    return 0
  }
  return Math.max(...siblings.map((task) => task.sortOrder)) + 1
}

export function reorderSiblingTasks(
  tasks: Task[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
): Task[] {
  const dragged = getTaskById(tasks, draggedId)
  const target = getTaskById(tasks, targetId)

  if (!dragged || !target || dragged.id === target.id) {
    return tasks
  }
  if (dragged.folderId !== target.folderId) {
    return tasks
  }

  const siblings = getTasksByFolder(tasks, dragged.folderId)
  const moving = siblings.find((task) => task.id === draggedId)
  if (!moving) {
    return tasks
  }

  const rest = siblings.filter((task) => task.id !== draggedId)
  let insertAt = rest.findIndex((task) => task.id === targetId)
  if (insertAt < 0) {
    return tasks
  }
  if (position === 'after') {
    insertAt += 1
  }
  rest.splice(insertAt, 0, moving)

  const orderById = new Map(rest.map((task, index) => [task.id, index]))
  return tasks.map((task) => {
    const sortOrder = orderById.get(task.id)
    return sortOrder === undefined ? task : { ...task, sortOrder }
  })
}
