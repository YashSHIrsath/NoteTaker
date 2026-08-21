import type { Folder, Subtask, Task } from '../../types'
import { RepositoryError } from '../../repositories/errors'
import { getNotesRepository, LocalNotesDataRepository, SupabaseNotesDataRepository } from '../../repositories'
import { getSupabaseClient } from '../../lib/supabase'
import type { AppSnapshot } from '../storage/types'
import { buildIdMaps, isUuid } from './idMap'
import { mapSnapshotToUuidNotes, mapsFromSnapshot } from './mapSnapshot'
import { NotesLocalToSupabaseMigration } from './notesMigrationService'
import type { MappedNotesInsert, MigrationMarkerStore, NotesMigrationMarker } from './types'
import { validateLocalSnapshot } from './validateSnapshot'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const emptyUi = {
  myNotesSidebarExpanded: true,
  expandedFolderIds: [] as string[],
  expandedTaskIds: [] as string[],
  expandedSubtaskIds: [] as string[],
  collapsedSubtaskIds: [] as string[],
}

function sampleSnapshot(): AppSnapshot {
  return {
    version: 4,
    folders: [
      { id: 'programming', name: 'Programming', parentId: null, isImportant: true, sortOrder: 3 },
      { id: 'laravel', name: 'Laravel', parentId: 'programming', isImportant: false, sortOrder: 0 },
      { id: 'eloquent', name: 'Eloquent', parentId: 'laravel', isImportant: false, sortOrder: 1 },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Read docs',
        folderId: 'eloquent',
        content: 'notes',
        isImportant: true,
        sortOrder: 7,
      },
    ],
    subtasks: [
      { id: 'sub-root', title: 'Parent', taskId: 'task-1', parentSubtaskId: null, completed: false },
      { id: 'sub-child', title: 'Child', taskId: 'task-1', parentSubtaskId: 'sub-root', completed: true },
    ],
    uiState: emptyUi,
  }
}

class MemoryMarkers implements MigrationMarkerStore {
  readonly rows = new Map<string, NotesMigrationMarker>()

  async get(userId: string): Promise<NotesMigrationMarker | null> {
    return this.rows.get(userId) ?? null
  }

  async save(marker: NotesMigrationMarker): Promise<void> {
    this.rows.set(marker.userId, { ...marker, idMap: structuredClone(marker.idMap) })
  }
}

class MemoryInserts implements MappedNotesInsert {
  folders: Folder[] = []
  tasks: Task[] = []
  subtasks: Subtask[] = []
  folderCalls = 0
  failFolders = false

  async upsertFolders(folders: Folder[]): Promise<void> {
    this.folderCalls += 1
    if (this.failFolders) {
      throw new Error('insert folders failed')
    }
    for (const folder of folders) {
      this.folders = this.folders.filter((item) => item.id !== folder.id)
      this.folders.push(folder)
    }
  }

  async upsertTasks(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      this.tasks = this.tasks.filter((item) => item.id !== task.id)
      this.tasks.push(task)
    }
  }

  async upsertSubtasks(subtasks: Subtask[]): Promise<void> {
    for (const subtask of subtasks) {
      this.subtasks = this.subtasks.filter((item) => item.id !== subtask.id)
      this.subtasks.push(subtask)
    }
  }
}

export function runMigrationChecks(): void {
  const sequential = (() => {
    let n = 0
    return () => {
      n += 1
      return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
    }
  })()

  const maps = buildIdMaps(
    { folderIds: ['programming', 'laravel'], taskIds: ['task-1'], subtaskIds: ['sub-root', 'sub-child'] },
    undefined,
    sequential,
  )
  assert(maps.folders.programming !== 'programming', 'folder string ids are converted')
  assert(isUuid(maps.folders.programming ?? ''), 'folder mapped id is uuid')
  assert(isUuid(maps.tasks['task-1'] ?? ''), 'task mapped id is uuid')
  assert(isUuid(maps.subtasks['sub-root'] ?? ''), 'subtask mapped id is uuid')

  const snapshot = sampleSnapshot()
  validateLocalSnapshot(snapshot)
  const mapped = mapSnapshotToUuidNotes(snapshot, mapsFromSnapshot(snapshot, maps))
  const programming = mapped.folders.find((item) => item.name === 'Programming')
  const laravel = mapped.folders.find((item) => item.name === 'Laravel')
  const eloquent = mapped.folders.find((item) => item.name === 'Eloquent')
  assert(programming?.parentId === null, 'root folder parent stays null')
  assert(laravel?.parentId === programming?.id, 'nested folder uses mapped parent uuid')
  assert(eloquent?.parentId === laravel?.id, 'deep nested folder mapping')
  assert(mapped.tasks[0]?.folderId === eloquent?.id, 'task uses mapped folder uuid')
  assert(mapped.tasks[0]?.isImportant === true, 'task isImportant preserved')
  assert(mapped.tasks[0]?.sortOrder === 7, 'task sortOrder preserved')
  assert(programming?.isImportant === true, 'folder isImportant preserved')
  assert(programming?.sortOrder === 3, 'folder sortOrder preserved')
  const parentSub = mapped.subtasks.find((item) => item.title === 'Parent')
  const childSub = mapped.subtasks.find((item) => item.title === 'Child')
  assert(parentSub?.parentSubtaskId === null, 'root subtask parent stays null')
  assert(childSub?.parentSubtaskId === parentSub?.id, 'nested subtask uses mapped parent uuid')
  assert(childSub?.taskId === mapped.tasks[0]?.id, 'subtask uses mapped task uuid')

  let invalid = false
  try {
    validateLocalSnapshot({
      ...snapshot,
      tasks: [{ ...snapshot.tasks[0]!, folderId: 'missing-folder' }],
    })
  } catch {
    invalid = true
  }
  assert(invalid, 'invalid task folder reference is rejected')

  invalid = false
  try {
    validateLocalSnapshot({
      ...snapshot,
      folders: [...snapshot.folders, { id: 'programming', name: 'Dup', parentId: null, isImportant: false, sortOrder: 9 }],
    })
  } catch {
    invalid = true
  }
  assert(invalid, 'duplicate folder ids are rejected')
}

export async function runMigrationServiceChecks(): Promise<void> {
  if (getSupabaseClient()) {
    assert(getNotesRepository() instanceof SupabaseNotesDataRepository, 'configured client uses Supabase notes')
  } else {
    assert(getNotesRepository() instanceof LocalNotesDataRepository, 'LocalStorage remains available as fallback')
  }

  const userId = '11111111-1111-4111-8111-111111111111'
  const snapshot = sampleSnapshot()
  const original = structuredClone(snapshot)
  const markers = new MemoryMarkers()
  const inserts = new MemoryInserts()
  const source = { readSnapshot: () => snapshot }

  const first = await new NotesLocalToSupabaseMigration(source, markers, inserts, userId).run()
  assert(first.status === 'completed', 'first migration completes')
  if (first.status !== 'completed') {
    return
  }
  assert(first.folderCount === 3, 'folder count')
  assert(inserts.folders.every((folder) => !('userId' in folder)), 'payload does not set another user id')
  assert(JSON.stringify(snapshot) === JSON.stringify(original), 'source snapshot is not mutated')

  const second = await new NotesLocalToSupabaseMigration(source, markers, inserts, userId).run()
  assert(second.status === 'already_complete', 'completed migration is not repeated')
  const folderInsertsAfterComplete = inserts.folderCalls

  const retryMarkers = new MemoryMarkers()
  const retryInserts = new MemoryInserts()
  retryInserts.failFolders = true
  try {
    await new NotesLocalToSupabaseMigration(source, retryMarkers, retryInserts, userId).run()
    throw new Error('expected retry setup to fail')
  } catch (error) {
    assert(error instanceof RepositoryError, 'failed migration becomes application error')
  }
  assert(retryMarkers.rows.get(userId)?.status === 'failed', 'failed marker is stored')
  const savedMap = retryMarkers.rows.get(userId)?.idMap
  retryInserts.failFolders = false
  const retried = await new NotesLocalToSupabaseMigration(source, retryMarkers, retryInserts, userId).run()
  assert(retried.status === 'completed', 'retry after failure completes')
  assert(
    JSON.stringify(retryMarkers.rows.get(userId)?.idMap) === JSON.stringify(savedMap),
    'retry reuses the stored id map',
  )

  const emptyMarkers = new MemoryMarkers()
  const emptyInserts = new MemoryInserts()
  const emptyResult = await new NotesLocalToSupabaseMigration(
    { readSnapshot: () => null },
    emptyMarkers,
    emptyInserts,
    userId,
  ).run()
  assert(emptyResult.status === 'completed', 'empty dataset migrates')
  if (emptyResult.status === 'completed') {
    assert(emptyResult.folderCount === 0, 'empty dataset inserts nothing')
  }

  assert(folderInsertsAfterComplete === inserts.folderCalls, 'already-complete run does not insert again')
}
