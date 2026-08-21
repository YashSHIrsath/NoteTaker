import { createDefaultSnapshot } from '../services/storage/defaults'
import { LocalStorageNotesRepository } from '../services/storage/localStorageRepository'
import { NOTES_STORAGE_VERSION, type AppSnapshot, type NotesRepository } from '../services/storage/types'
import { collectFolderSubtreeIds } from '../lib/folders'
import { collectTaskIdsInFolders } from '../lib/tasks'
import { collectSubtaskSubtreeIds } from '../lib/subtasks'
import { RepositoryError } from './errors'
import type { NotesDataRepository } from './types'

/**
 * LocalStorage-backed notes document.
 * Kept as a fallback/development implementation. Authenticated users use Supabase.
 */
export class LocalNotesDataRepository implements NotesDataRepository {
  private readonly storage: NotesRepository

  constructor(storage: NotesRepository = new LocalStorageNotesRepository()) {
    this.storage = storage
  }

  load(): AppSnapshot {
    const existing = this.storage.load()
    if (existing) {
      return existing
    }

    const initial = createDefaultSnapshot()
    this.storage.save(initial)
    return initial
  }

  save(snapshot: AppSnapshot): void {
    this.storage.save({
      ...snapshot,
      version: NOTES_STORAGE_VERSION,
    })
  }

  deleteFolder(folderId: string): void {
    const snapshot = this.requireSnapshot()
    if (!snapshot.folders.some((folder) => folder.id === folderId)) {
      throw new RepositoryError('Could not delete the folder.')
    }
    const folderIds = new Set(collectFolderSubtreeIds(snapshot.folders, folderId))
    const taskIds = new Set(collectTaskIdsInFolders(snapshot.tasks, folderIds))
    this.save({
      ...snapshot,
      folders: snapshot.folders.filter((folder) => !folderIds.has(folder.id)),
      tasks: snapshot.tasks.filter((task) => !taskIds.has(task.id)),
      subtasks: snapshot.subtasks.filter((subtask) => !taskIds.has(subtask.taskId)),
    })
  }

  deleteTask(taskId: string): void {
    const snapshot = this.requireSnapshot()
    if (!snapshot.tasks.some((task) => task.id === taskId)) {
      throw new RepositoryError('Could not delete the task.')
    }
    this.save({
      ...snapshot,
      tasks: snapshot.tasks.filter((task) => task.id !== taskId),
      subtasks: snapshot.subtasks.filter((subtask) => subtask.taskId !== taskId),
    })
  }

  deleteSubtask(subtaskId: string): void {
    const snapshot = this.requireSnapshot()
    if (!snapshot.subtasks.some((subtask) => subtask.id === subtaskId)) {
      throw new RepositoryError('Could not delete the subtask.')
    }
    const ids = new Set(collectSubtaskSubtreeIds(snapshot.subtasks, subtaskId))
    this.save({
      ...snapshot,
      subtasks: snapshot.subtasks.filter((subtask) => !ids.has(subtask.id)),
    })
  }

  private requireSnapshot(): AppSnapshot {
    return this.load()
  }
}
