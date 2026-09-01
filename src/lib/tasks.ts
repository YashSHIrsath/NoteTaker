import type { Task } from '../types'

export function compareTasksBySortOrder(a: Task, b: Task): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder
  }
  return a.id.localeCompare(b.id)
}

/**
 * Flow order: sortOrder, then id. What every listing falls back to for cards nobody has arranged.
 *
 * The id is not a tidy-up. `sortOrder` is unique within a folder and restarts at 0 in the next one,
 * so a listing that spans folders — Tasks, Starred — has almost every row tied with several others.
 * Those pages used to render the provider's array as it came, which is what the load returned for
 * `ORDER BY sort_order`, and Postgres gives no order to tied rows: rewriting any one of them can
 * change which comes back first. Saving a card's size was enough to reshuffle the page.
 */
export function inBaseOrder(tasks: Task[]): Task[] {
  return [...tasks].sort(compareTasksBySortOrder)
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

  // Renumbering sortOrder isn't enough on its own: views that sort by it (a folder's own list)
  // picked the change up, but the flat cross-folder lists (Tasks, Important) render this array in
  // its existing order, so a drag there saved correctly and appeared to do nothing.
  //
  // So the array is re-sequenced too: walk it, and wherever it holds one of these siblings, emit
  // the next sibling from the new order instead. Other folders' tasks keep their positions, so a
  // reorder in one folder can't reshuffle the flat list as a whole.
  const queue = rest.map((task, index) => ({ ...task, sortOrder: index }))
  const siblingIds = new Set(siblings.map((task) => task.id))
  let next = 0
  return tasks.map((task) => (siblingIds.has(task.id) ? queue[next++] : task))
}
