import type { Attachment } from '../types'
import type { AppSnapshot, UiState } from '../services/storage'

export type { AppSnapshot, UiState }

export type MaybePromise<T> = T | Promise<T>

/**
 * Persisted notes document (folders, tasks, subtasks, UI expand state).
 * LocalStorage is synchronous; Supabase is asynchronous. FolderContext treats both as MaybePromise.
 */
export interface NotesDataRepository {
  load(): MaybePromise<AppSnapshot>
  save(snapshot: AppSnapshot): MaybePromise<void>
  deleteFolder(folderId: string): MaybePromise<void>
  deleteTask(taskId: string): MaybePromise<void>
  deleteSubtask(subtaskId: string): MaybePromise<void>
}

/** Files attached to a task. LocalStorage implementation is in-memory; Supabase uses Storage + metadata. */
export interface AttachmentDataRepository {
  createAttachment(taskId: string, file: File): MaybePromise<Attachment>
  getFile(id: string): MaybePromise<File | null>
  getPreviewUrl(id: string): MaybePromise<string | null>
  deleteAttachment(id: string): MaybePromise<void>
  listAttachments(): MaybePromise<Attachment[]>
  listStoragePathsForTaskIds(taskIds: string[]): MaybePromise<string[]>
  removeStoragePaths(paths: string[]): MaybePromise<void>
  clearCache(): void
}

export interface AppRepositories {
  notes: NotesDataRepository
  attachments: AttachmentDataRepository
}
