import { NOTES_STORAGE_VERSION, type AppSnapshot, type UiState } from '../services/storage/types'

export function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return structuredClone(snapshot)
}

export function notesFingerprint(snapshot: Pick<AppSnapshot, 'folders' | 'tasks' | 'subtasks'>): string {
  return JSON.stringify({
    folders: snapshot.folders,
    tasks: snapshot.tasks,
    subtasks: snapshot.subtasks,
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

export function snapshotFromParts(
  folders: AppSnapshot['folders'],
  tasks: AppSnapshot['tasks'],
  subtasks: AppSnapshot['subtasks'],
  uiState: UiState,
): AppSnapshot {
  return {
    version: NOTES_STORAGE_VERSION,
    folders,
    tasks,
    subtasks,
    uiState,
  }
}
