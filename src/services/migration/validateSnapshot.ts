import type { AppSnapshot } from '../storage/types'
import { layersByParent } from '../../repositories/supabase/mappers'

export class MigrationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationValidationError'
  }
}

function requireNonEmpty(value: string, label: string): void {
  if (!value.trim()) {
    throw new MigrationValidationError(`${label} is required.`)
  }
}

function uniqueIds(ids: string[], label: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (!id) {
      throw new MigrationValidationError(`${label} is missing an id.`)
    }
    if (seen.has(id)) {
      throw new MigrationValidationError(`Duplicate ${label} id.`)
    }
    seen.add(id)
  }
}

export function validateLocalSnapshot(snapshot: AppSnapshot): void {
  uniqueIds(snapshot.folders.map((item) => item.id), 'folder')
  uniqueIds(snapshot.tasks.map((item) => item.id), 'task')
  uniqueIds(snapshot.subtasks.map((item) => item.id), 'subtask')

  const folderIds = new Set(snapshot.folders.map((item) => item.id))
  const taskIds = new Set(snapshot.tasks.map((item) => item.id))
  const subtaskIds = new Set(snapshot.subtasks.map((item) => item.id))

  for (const folder of snapshot.folders) {
    requireNonEmpty(folder.name, 'Folder name')
    if (typeof folder.sortOrder !== 'number' || !Number.isFinite(folder.sortOrder)) {
      throw new MigrationValidationError('Folder sort order is invalid.')
    }
    if (folder.parentId !== null && !folderIds.has(folder.parentId)) {
      throw new MigrationValidationError('Folder parent does not exist.')
    }
  }

  try {
    layersByParent(snapshot.folders.map((folder) => ({ id: folder.id, parentId: folder.parentId })))
  } catch {
    throw new MigrationValidationError('Folder hierarchy is invalid.')
  }

  for (const task of snapshot.tasks) {
    requireNonEmpty(task.title, 'Task title')
    if (typeof task.sortOrder !== 'number' || !Number.isFinite(task.sortOrder)) {
      throw new MigrationValidationError('Task sort order is invalid.')
    }
    if (!folderIds.has(task.folderId)) {
      throw new MigrationValidationError('Task references a missing folder.')
    }
  }

  for (const subtask of snapshot.subtasks) {
    requireNonEmpty(subtask.title, 'Subtask title')
    if (!taskIds.has(subtask.taskId)) {
      throw new MigrationValidationError('Subtask references a missing task.')
    }
    if (subtask.parentSubtaskId !== null && !subtaskIds.has(subtask.parentSubtaskId)) {
      throw new MigrationValidationError('Subtask parent does not exist.')
    }
  }

  try {
    layersByParent(
      snapshot.subtasks.map((subtask) => ({
        id: subtask.id,
        parentId: subtask.parentSubtaskId,
      })),
    )
  } catch {
    throw new MigrationValidationError('Subtask hierarchy is invalid.')
  }
}
