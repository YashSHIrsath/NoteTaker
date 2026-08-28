import type { SupabaseClient } from '@supabase/supabase-js'
import { RepositoryError } from '../../repositories/errors'
import { folderToRow, subtaskToRow, taskToRow } from '../../repositories/supabase/mappers'
import type { Folder, Subtask, Task } from '../../types'
import { emptyIdMaps, type IdMaps } from './idMap'
import type { MappedNotesInsert, MigrationMarkerStore, NotesMigrationMarker } from './types'

function throwIfError(error: { message?: string } | null, fallback: string): void {
  if (error) {
    throw new RepositoryError(fallback, { cause: error })
  }
}

function parseIdMap(raw: unknown): IdMaps {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return emptyIdMaps()
  }
  const record = raw as Record<string, unknown>
  const asStringMap = (value: unknown): Record<string, string> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {}
    }
    const next: Record<string, string> = {}
    for (const [key, mapped] of Object.entries(value as Record<string, unknown>)) {
      if (typeof mapped === 'string') {
        next[key] = mapped
      }
    }
    return next
  }
  return {
    folders: asStringMap(record.folders),
    tasks: asStringMap(record.tasks),
    subtasks: asStringMap(record.subtasks),
  }
}

export class SupabaseMigrationMarkerStore implements MigrationMarkerStore {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async get(userId: string): Promise<NotesMigrationMarker | null> {
    const { data, error } = await this.client
      .from('notes_migrations')
      .select('user_id,status,id_map')
      .eq('user_id', userId)
      .limit(1)
    throwIfError(error, 'Could not check migration status.')
    const row = (data ?? [])[0] as
      | { user_id: string; status: NotesMigrationMarker['status']; id_map: unknown }
      | undefined
    if (!row) {
      return null
    }
    return {
      userId: row.user_id,
      status: row.status,
      idMap: parseIdMap(row.id_map),
    }
  }

  async save(marker: NotesMigrationMarker): Promise<void> {
    const { error } = await this.client.from('notes_migrations').upsert(
      {
        user_id: marker.userId,
        status: marker.status,
        id_map: marker.idMap,
        completed_at: marker.status === 'completed' ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id' },
    )
    throwIfError(error, 'Could not save migration status.')
  }
}

export class SupabaseMappedNotesInsert implements MappedNotesInsert {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  async upsertFolders(folders: Folder[]): Promise<void> {
    if (folders.length === 0) {
      return
    }
    // Always personal: this is the one-time import of a browser's LocalStorage notes into the
    // account that owns them. Nothing about it has ever concerned a shared space.
    const { error } = await this.client.from('folders').upsert(folders.map((folder) => folderToRow(folder, null)), {
      onConflict: 'id',
    })
    throwIfError(error, 'Could not migrate folders.')
  }

  async upsertTasks(tasks: Task[]): Promise<void> {
    if (tasks.length === 0) {
      return
    }
    const { error } = await this.client.from('tasks').upsert(tasks.map(taskToRow), { onConflict: 'id' })
    throwIfError(error, 'Could not migrate tasks.')
  }

  async upsertSubtasks(subtasks: Subtask[]): Promise<void> {
    if (subtasks.length === 0) {
      return
    }
    const { error } = await this.client.from('subtasks').upsert(subtasks.map(subtaskToRow), {
      onConflict: 'id',
    })
    throwIfError(error, 'Could not migrate subtasks.')
  }
}
