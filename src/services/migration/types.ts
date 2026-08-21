import type { Folder, Subtask, Task } from '../../types'
import type { AppSnapshot } from '../storage/types'
import type { IdMaps } from './idMap'

export type MigrationStatus = 'in_progress' | 'failed' | 'completed'

export interface NotesMigrationMarker {
  userId: string
  status: MigrationStatus
  idMap: IdMaps
}

export interface MappedNotesInsert {
  upsertFolders(folders: Folder[]): Promise<void>
  upsertTasks(tasks: Task[]): Promise<void>
  upsertSubtasks(subtasks: Subtask[]): Promise<void>
}

export interface MigrationMarkerStore {
  get(userId: string): Promise<NotesMigrationMarker | null>
  save(marker: NotesMigrationMarker): Promise<void>
}

export interface NotesMigrationSource {
  /** Read-only. Must not write LocalStorage. */
  readSnapshot(): AppSnapshot | null
}

export type MigrationResult =
  | { status: 'already_complete' }
  | { status: 'completed'; folderCount: number; taskCount: number; subtaskCount: number }
