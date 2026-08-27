import type { Folder, Subtask, Tag, Task } from '../../types'
import { NOTES_STORAGE_VERSION, type AppSnapshot, type UiState } from './types'
import { isTaskColor } from '../../lib/taskColor'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFolder(value: unknown): value is Folder {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.parentId === null || typeof value.parentId === 'string') &&
    typeof value.isImportant === 'boolean' &&
    typeof value.sortOrder === 'number'
  )
}

function isTask(value: unknown): value is Task {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.folderId === 'string' &&
    typeof value.content === 'string' &&
    typeof value.isImportant === 'boolean' &&
    typeof value.isPinned === 'boolean' &&
    typeof value.sortOrder === 'number' &&
    (value.noteKind === 'note' || value.noteKind === 'due_task') &&
    (value.dueAt === null || typeof value.dueAt === 'string') &&
    typeof value.completed === 'boolean' &&
    (value.completedAt === null || typeof value.completedAt === 'string') &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    (value.color === null || isTaskColor(value.color))
  )
}

function isSubtask(value: unknown): value is Subtask {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.taskId === 'string' &&
    (value.parentSubtaskId === null || typeof value.parentSubtaskId === 'string') &&
    typeof value.completed === 'boolean'
  )
}

function isTag(value: unknown): value is Tag {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.id === 'string' && typeof value.name === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isUiState(value: unknown): value is UiState {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.myNotesSidebarExpanded === 'boolean' &&
    isStringArray(value.expandedFolderIds) &&
    isStringArray(value.expandedTaskIds) &&
    isStringArray(value.expandedSubtaskIds) &&
    (value.collapsedSubtaskIds === undefined || isStringArray(value.collapsedSubtaskIds))
  )
}

export function parseSnapshot(value: unknown): AppSnapshot | null {
  if (!isRecord(value) || value.version !== NOTES_STORAGE_VERSION) {
    return null
  }
  if (!Array.isArray(value.folders) || !value.folders.every(isFolder)) {
    return null
  }
  if (!Array.isArray(value.tasks) || !value.tasks.every(isTask)) {
    return null
  }
  if (!Array.isArray(value.subtasks) || !value.subtasks.every(isSubtask)) {
    return null
  }
  // Absent rather than invalid in a document written before the catalogue existed; the storage
  // migration fills it in, and this stays lenient so a hand-edited file missing it still loads.
  if (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every(isTag))) {
    return null
  }
  if (!isUiState(value.uiState)) {
    return null
  }

  return {
    version: NOTES_STORAGE_VERSION,
    folders: value.folders,
    tasks: value.tasks,
    subtasks: value.subtasks,
    tags: Array.isArray(value.tags) ? value.tags : [],
    uiState: {
      myNotesSidebarExpanded: value.uiState.myNotesSidebarExpanded,
      expandedFolderIds: value.uiState.expandedFolderIds,
      expandedTaskIds: value.uiState.expandedTaskIds,
      expandedSubtaskIds: value.uiState.expandedSubtaskIds,
      collapsedSubtaskIds: value.uiState.collapsedSubtaskIds ?? [],
    },
  }
}
