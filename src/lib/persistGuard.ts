import { NOTES_STORAGE_VERSION, type AppSnapshot, type UiState } from '../services/storage/types'

export function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return structuredClone(snapshot)
}

export function notesFingerprint(
  snapshot: Pick<AppSnapshot, 'folders' | 'tasks' | 'subtasks' | 'tags'>,
): string {
  return JSON.stringify({
    folders: snapshot.folders,
    tasks: snapshot.tasks,
    subtasks: snapshot.subtasks,
    // The catalogue is in here because a tag can change without any task changing: making one
    // ahead of time, renaming it, or deleting one nothing carries. Left out, those saves would be
    // skipped as no-ops and the tag would be gone on the next reload.
    tags: snapshot.tags,
  })
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

export function rollbackNotesOnSaveFailure(args: {
  lastConfirmed: AppSnapshot
  attempted: AppSnapshot
}): { restored: AppSnapshot; pendingRetry: AppSnapshot } {
  return {
    restored: cloneSnapshot(args.lastConfirmed),
    pendingRetry: cloneSnapshot(args.attempted),
  }
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
 * The fix belongs here rather than in the title field, because the field is not the only way a
 * blank name can be produced (an import, a migration, a future editor) and one rejected row rolls
 * back *everything*, not just the note you were touching.
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
    // Every outgoing snapshot is built here, and so is every snapshot recorded as confirmed —
    // which is what keeps the two comparable. Normalising in one and not the other would leave the
    // fingerprints permanently unequal and re-save on a loop.
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
