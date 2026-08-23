import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabase'
import type { AppSnapshot } from '../../services/storage/types'
import { missingColumnName, RepositoryError, toRepositoryError } from '../errors'
import type { NotesDataRepository } from '../types'
import {
  folderToRow,
  layersByParent,
  snapshotFromRows,
  subtaskToRow,
  taskToRow,
  type FolderRow,
  type SubtaskRow,
  type TaskRow,
} from './mappers'
import { loadPersistedUiState, persistUiState, normalizeUiState } from './uiStateStore'

/**
 * Every column the tasks query reads back.
 *
 * A comment used to ask the next person to keep this in step with TaskRow, and twice it wasn't:
 * a saved card colour came back as "Auto" on reload, and then a resized card came back at its
 * default size — both written to the database but never selected out of it. The two checks below
 * make that a compile error instead of a field that quietly resets on the next page load.
 *
 * It stays a literal rather than a joined array because supabase-js reads the string as a type:
 * hand .select() a plain string and the row comes back as GenericStringError[].
 */
const TASK_COLUMNS =
  'id,folder_id,title,content,is_important,is_pinned,sort_order,due_at,remind_before_minutes,status,tags,color,grid_layout'

type SplitColumns<S extends string> = S extends `${infer Head},${infer Rest}`
  ? Head | SplitColumns<Rest>
  : S

/** A type error here means TaskRow has a field TASK_COLUMNS doesn't select — it would load as
 *  undefined and reset to the mapper's default on every reload. */
const _everyTaskColumnIsSelected: Exclude<
  keyof TaskRow,
  SplitColumns<typeof TASK_COLUMNS>
> extends never
  ? true
  : never = true

/** And a type error here means TASK_COLUMNS names a column TaskRow doesn't have, which Postgres
 *  would reject at query time. */
const _everySelectedColumnExists: Exclude<
  SplitColumns<typeof TASK_COLUMNS>,
  keyof TaskRow
> extends never
  ? true
  : never = true

void _everyTaskColumnIsSelected
void _everySelectedColumnExists

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requireUuid(id: string, label: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new RepositoryError(`${label} must be a UUID before saving to Supabase.`)
  }
}

function throwIfError(error: { message?: string } | null, fallback: string): void {
  if (error) {
    throw toRepositoryError(error, fallback)
  }
}

/**
 * Supabase Postgres implementation of the notes document contract.
 * Ownership is determined by the Auth session and RLS, never by a UI-supplied user id.
 */
export class SupabaseNotesDataRepository implements NotesDataRepository {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient | null = getSupabaseClient()) {
    if (!client) {
      throw new RepositoryError('Supabase is not configured.')
    }
    this.client = client
  }

  private async requireSession(): Promise<string> {
    const { data, error } = await this.client.auth.getUser()
    if (error || !data.user) {
      throw new RepositoryError('You need to be signed in.')
    }
    return data.user.id
  }

  async load(): Promise<AppSnapshot> {
    try {
      const userId = await this.requireSession()
      const [foldersResult, tasksResult, subtasksResult] = await Promise.all([
        this.client
          .from('folders')
          .select('id,parent_id,name,is_important,sort_order')
          .order('sort_order', { ascending: true }),
        this.client
          .from('tasks')
          .select(TASK_COLUMNS)
          .order('sort_order', { ascending: true }),
        this.client.from('subtasks').select('id,task_id,parent_subtask_id,title,completed'),
      ])

      throwIfError(foldersResult.error, 'Could not load folders.')
      throwIfError(tasksResult.error, 'Could not load tasks.')
      throwIfError(subtasksResult.error, 'Could not load subtasks.')

      return snapshotFromRows(
        (foldersResult.data ?? []) as FolderRow[],
        (tasksResult.data ?? []) as TaskRow[],
        (subtasksResult.data ?? []) as SubtaskRow[],
        normalizeUiState(loadPersistedUiState(userId)),
      )
    } catch (error) {
      throw toRepositoryError(error, 'Could not load notes.')
    }
  }

  async save(snapshot: AppSnapshot): Promise<void> {
    try {
      const userId = await this.requireSession()
      try {
        persistUiState(snapshot.uiState, userId)
      } catch {
        /* expand/collapse flags are local; do not fail a notes save */
      }

      for (const folder of snapshot.folders) {
        requireUuid(folder.id, 'Folder id')
        if (folder.parentId) {
          requireUuid(folder.parentId, 'Folder parent id')
        }
      }
      for (const task of snapshot.tasks) {
        requireUuid(task.id, 'Task id')
        requireUuid(task.folderId, 'Task folder id')
      }
      for (const subtask of snapshot.subtasks) {
        requireUuid(subtask.id, 'Subtask id')
        requireUuid(subtask.taskId, 'Subtask task id')
        if (subtask.parentSubtaskId) {
          requireUuid(subtask.parentSubtaskId, 'Subtask parent id')
        }
      }

      const folderLayers = this.orderedLayers(
        snapshot.folders.map((folder) => ({
          id: folder.id,
          parentId: folder.parentId,
          folder,
        })),
      ).map((layer) => layer.map((item) => item.folder))

      for (const layer of folderLayers) {
        if (layer.length === 0) {
          continue
        }
        const { error } = await this.client.from('folders').upsert(layer.map(folderToRow), {
          onConflict: 'id',
        })
        throwIfError(error, 'Could not save folders.')
      }

      if (snapshot.tasks.length > 0) {
        const rows = snapshot.tasks.map(taskToRow)
        const { error: taskError } = await this.client.from('tasks').upsert(rows, { onConflict: 'id' })
        // A column this database doesn't have yet (a migration not pushed) would otherwise fail
        // every save, taking titles, content and everything else down with it. Retry without the
        // column so the rest of the note still saves; the dropped field is named in the console
        // rather than swallowed, since it silently won't survive a reload until the migration runs.
        const missing = missingColumnName(taskError)
        if (missing) {
          console.warn(
            `Supabase is missing the "${missing}" column on tasks — saving without it. Apply the pending migration (npm run db:push) to keep that field.`,
          )
          const trimmed = rows.map((row) => {
            const copy = { ...row } as Record<string, unknown>
            delete copy[missing]
            return copy
          })
          const { error: retryError } = await this.client
            .from('tasks')
            .upsert(trimmed, { onConflict: 'id' })
          throwIfError(retryError, 'Could not save tasks.')
        } else {
          throwIfError(taskError, 'Could not save tasks.')
        }
      }

      const subtaskLayers = this.orderedLayers(
        snapshot.subtasks.map((subtask) => ({
          id: subtask.id,
          parentId: subtask.parentSubtaskId,
          subtask,
        })),
      ).map((layer) => layer.map((item) => item.subtask))

      for (const layer of subtaskLayers) {
        if (layer.length === 0) {
          continue
        }
        const { error } = await this.client.from('subtasks').upsert(layer.map(subtaskToRow), {
          onConflict: 'id',
        })
        throwIfError(error, 'Could not save subtasks.')
      }

      await this.deleteMissing('subtasks', snapshot.subtasks.map((item) => item.id))
      await this.deleteMissing('tasks', snapshot.tasks.map((item) => item.id))
      await this.deleteMissing('folders', snapshot.folders.map((item) => item.id))
    } catch (error) {
      throw toRepositoryError(error, 'Could not save notes.')
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    await this.deleteOwnedRow('folders', folderId, 'Could not delete the folder.')
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.deleteOwnedRow('tasks', taskId, 'Could not delete the task.')
  }

  async deleteSubtask(subtaskId: string): Promise<void> {
    await this.deleteOwnedRow('subtasks', subtaskId, 'Could not delete the subtask.')
  }

  private async deleteOwnedRow(
    table: 'folders' | 'tasks' | 'subtasks',
    id: string,
    fallback: string,
  ): Promise<void> {
    try {
      await this.requireSession()
      requireUuid(id, 'Id')
      const { data, error } = await this.client.from(table).delete().eq('id', id).select('id')
      throwIfError(error, fallback)
      if (!data || data.length === 0) {
        throw new RepositoryError(fallback)
      }
    } catch (error) {
      throw toRepositoryError(error, fallback)
    }
  }

  private orderedLayers<T extends { id: string; parentId: string | null }>(items: T[]): T[][] {
    try {
      return layersByParent(items)
    } catch (error) {
      throw new RepositoryError('Could not save notes.', { cause: error })
    }
  }

  private async deleteMissing(table: 'folders' | 'tasks' | 'subtasks', keepIds: string[]): Promise<void> {
    const { data, error } = await this.client.from(table).select('id')
    throwIfError(error, 'Could not save notes.')
    const keep = new Set(keepIds)
    const toDelete = ((data ?? []) as Array<{ id: string }>).map((row) => row.id).filter((id) => !keep.has(id))
    if (toDelete.length === 0) {
      return
    }
    const { error: deleteError } = await this.client.from(table).delete().in('id', toDelete)
    throwIfError(deleteError, 'Could not save notes.')
  }
}
