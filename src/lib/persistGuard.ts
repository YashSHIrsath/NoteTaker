import { NOTES_STORAGE_VERSION, type AppSnapshot, type UiState } from '../services/storage/types'

export function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return structuredClone(snapshot)
}

export function shouldApplySessionResult(args: {
  cancelled: boolean
  requestUserId: string | null | undefined
  currentUserId: string | null | undefined
}): boolean {
  if (args.cancelled) {
    return false
  }
  if (!args.currentUserId || !args.requestUserId) {
    return false
  }
  return args.requestUserId === args.currentUserId
}

export function beginExclusiveAction(locks: Set<string>, key: string): boolean {
  if (locks.has(key)) {
    return false
  }
  locks.add(key)
  return true
}

export function endExclusiveAction(locks: Set<string>, key: string): void {
  locks.delete(key)
}

/** What a blank name is saved as — the same word the empty title field shows as its hint. */
export const UNTITLED = 'Untitled'
export const UNTITLED_FOLDER = 'Untitled folder'

/**
 * A name the database will accept.
 *
 * `folders.name`, `tasks.title` and `subtasks.title` all carry a `length(btrim(...)) > 0` check,
 * and the title field is happy to hold an empty string while you are in the middle of retyping
 * one. Those two facts met in the worst possible way: clearing a title scheduled a save, the save
 * was rejected by the constraint, and the failure handler did the only correct thing it could —
 * rolled the whole document back to the last snapshot the server had accepted. Which was a
 * half-deleted title. So the letters you had just removed came back, mid-word, over the top of
 * what you were typing.
 *
 * The repair the write path actually uses now lives in services/notes/ops (see repairNames), which
 * is where a single edit's rows pass through. This one still guards anything built as a whole
 * snapshot — the empty baseline, and the retry that re-applies a rejected batch.
 *
 * Only a name that is blank is replaced. A name with spaces around it is passed through exactly as
 * typed — `btrim` means the database is content, and trimming here would eat the space someone is
 * standing on halfway through typing "Job applications".
 */
function requiredName(value: string, fallback: string): string {
  return value.trim().length > 0 ? value : fallback
}

/** Maps only when something actually needs replacing, so an ordinary save allocates nothing. */
function withRequiredNames<T>(items: T[], read: (item: T) => string, fix: (item: T) => T): T[] {
  return items.some((item) => read(item).trim().length === 0) ? items.map(fix) : items
}

export function snapshotFromParts(
  folders: AppSnapshot['folders'],
  tasks: AppSnapshot['tasks'],
  subtasks: AppSnapshot['subtasks'],
  tags: AppSnapshot['tags'],
  uiState: UiState,
): AppSnapshot {
  return {
    version: NOTES_STORAGE_VERSION,
    folders: withRequiredNames(
      folders,
      (folder) => folder.name,
      (folder) => ({ ...folder, name: requiredName(folder.name, UNTITLED_FOLDER) }),
    ),
    tasks: withRequiredNames(
      tasks,
      (task) => task.title,
      (task) => ({ ...task, title: requiredName(task.title, UNTITLED) }),
    ),
    subtasks: withRequiredNames(
      subtasks,
      (subtask) => subtask.title,
      (subtask) => ({ ...subtask, title: requiredName(subtask.title, UNTITLED) }),
    ),
    tags,
    uiState,
  }
}
