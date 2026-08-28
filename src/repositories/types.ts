import type { Attachment, Reminder, ReminderDraft, TaskEvent } from '../types'
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

/**
 * Reminders, as ordinary per-row CRUD rather than part of the notes document.
 *
 * Deliberately not folded into NotesDataRepository: that one round-trips the whole snapshot and
 * deletes anything the snapshot doesn't mention, which would wipe a reminder added in another tab
 * and stamp over the `next_run_at` the scheduler wrote. Reminders are server-owned enough that
 * they need their own boundary.
 */
export interface RemindersDataRepository {
  /** Every reminder the signed-in account owns; the UI groups them by task itself. */
  listAll(): MaybePromise<Reminder[]>
  create(taskId: string, draft: ReminderDraft): MaybePromise<Reminder>
  remove(reminderId: string): MaybePromise<void>
  /** One task's history, newest first. Read on demand rather than with the notes document: it is
   *  only ever looked at for the note whose panel is open, and it grows without bound. */
  listEvents(taskId: string): MaybePromise<TaskEvent[]>
}

export interface AppRepositories {
  notes: NotesDataRepository
  attachments: AttachmentDataRepository
  reminders: RemindersDataRepository
}
