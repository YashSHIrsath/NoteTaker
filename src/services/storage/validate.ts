import type { Folder, Subtask, Task } from '../../types'
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
    (value.dueAt === null || typeof value.dueAt === 'string') &&
    (value.remindBeforeMinutes === null || typeof value.remindBeforeMinutes === 'number') &&
    (value.status === null || value.status === 'pending' || value.status === 'ongoing' || value.status === 'complete') &&
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
  if (!isUiState(value.uiState)) {
    return null
  }

  return {
    version: NOTES_STORAGE_VERSION,
    folders: value.folders,
    tasks: value.tasks,
    subtasks: value.subtasks,
    uiState: {
      myNotesSidebarExpanded: value.uiState.myNotesSidebarExpanded,
      expandedFolderIds: value.uiState.expandedFolderIds,
      expandedTaskIds: value.uiState.expandedTaskIds,
      expandedSubtaskIds: value.uiState.expandedSubtaskIds,
      collapsedSubtaskIds: value.uiState.collapsedSubtaskIds ?? [],
    },
  }
}
