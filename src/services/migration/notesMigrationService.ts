import { RepositoryError, toRepositoryError } from '../../repositories/errors'
import { layersByParent } from '../../repositories/supabase/mappers'
import type { Folder, Subtask, Task } from '../../types'
import { NOTES_STORAGE_VERSION } from '../storage/types'
import { cloneSnapshot, mapSnapshotToUuidNotes, mapsFromSnapshot } from './mapSnapshot'
import type {
  MappedNotesInsert,
  MigrationMarkerStore,
  NotesMigrationMarker,
  NotesMigrationSource,
  MigrationResult,
} from './types'
import { MigrationValidationError, validateLocalSnapshot } from './validateSnapshot'

export class NotesLocalToSupabaseMigration {
  private readonly source: NotesMigrationSource
  private readonly markers: MigrationMarkerStore
  private readonly inserts: MappedNotesInsert
  private readonly userId: string

  constructor(
    source: NotesMigrationSource,
    markers: MigrationMarkerStore,
    inserts: MappedNotesInsert,
    userId: string,
  ) {
    this.source = source
    this.markers = markers
    this.inserts = inserts
    this.userId = userId
  }

  async run(): Promise<MigrationResult> {
    const existing = await this.markers.get(this.userId)
    if (existing?.status === 'completed') {
      return { status: 'already_complete' }
    }

    const raw = this.source.readSnapshot()
    const snapshot = cloneSnapshot(
      raw ?? {
        version: NOTES_STORAGE_VERSION,
        folders: [],
        tasks: [],
        subtasks: [],
        tags: [],
        uiState: {
          myNotesSidebarExpanded: true,
          expandedFolderIds: [],
          expandedTaskIds: [],
          expandedSubtaskIds: [],
          collapsedSubtaskIds: [],
        },
      },
    )

    try {
      validateLocalSnapshot(snapshot)
    } catch (error) {
      if (error instanceof MigrationValidationError) {
        throw new RepositoryError(error.message)
      }
      throw toRepositoryError(error, 'Notes data is invalid and was not migrated.')
    }

    const idMap = mapsFromSnapshot(snapshot, existing?.idMap)
    const marker: NotesMigrationMarker = {
      userId: this.userId,
      status: 'in_progress',
      idMap,
    }
    await this.markers.save(marker)

    try {
      const mapped = mapSnapshotToUuidNotes(snapshot, idMap)
      await this.insertMapped(mapped.folders, mapped.tasks, mapped.subtasks)
      await this.markers.save({
        ...marker,
        status: 'completed',
      })
      return {
        status: 'completed',
        folderCount: mapped.folders.length,
        taskCount: mapped.tasks.length,
        subtaskCount: mapped.subtasks.length,
      }
    } catch (error) {
      await this.markers.save({
        ...marker,
        status: 'failed',
      })
      throw toRepositoryError(error, 'Could not migrate notes. Local data was not changed. You can retry.')
    }
  }

  private async insertMapped(folders: Folder[], tasks: Task[], subtasks: Subtask[]): Promise<void> {
    const folderLayers = layersByParent(
      folders.map((folder) => ({ id: folder.id, parentId: folder.parentId, folder })),
    )
    for (const layer of folderLayers) {
      await this.inserts.upsertFolders(layer.map((item) => item.folder))
    }
    await this.inserts.upsertTasks(tasks)
    const subtaskLayers = layersByParent(
      subtasks.map((subtask) => ({
        id: subtask.id,
        parentId: subtask.parentSubtaskId,
        subtask,
      })),
    )
    for (const layer of subtaskLayers) {
      await this.inserts.upsertSubtasks(layer.map((item) => item.subtask))
    }
  }
}
