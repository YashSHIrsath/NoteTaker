import type { SupabaseClient } from '@supabase/supabase-js'
import { RepositoryError } from '../errors'
import { getSupabaseClient } from '../../lib/supabase'
import { getNotesRepository, LocalNotesDataRepository, SupabaseNotesDataRepository as ActiveSupabaseNotes } from '../index'
import {
  attachmentFromRow,
  folderFromRow,
  layersByParent,
  snapshotFromRows,
  subtaskFromRow,
  taskFromRow,
} from './mappers'
import { toAuthErrorMessage } from '../../lib/authErrors'
import { runAttachmentStorageChecks } from '../../services/attachments/attachmentStorageChecks'
import { runInvalidRecordChecks, runPersistHardeningChecks } from '../../services/persistence/persistHardeningChecks'
import { runDeletionChecks, runDuplicateDeleteLockCheck } from '../../services/deletion/deletionChecks'
import { runFolderManagementChecks } from '../../services/folders/folderManagementChecks'
import { runSearchChecks } from '../../services/search/searchChecks'
import { runSchedulingChecks } from '../../services/scheduling/schedulingChecks'
import { runTaskEditorChecks } from '../../services/persistence/taskEditorChecks'
import { runMigrationChecks, runMigrationServiceChecks } from '../../services/migration/migrationChecks'
import { runAttachmentHardeningChecks } from './attachmentHardeningChecks'
import { SupabaseNotesDataRepository } from './supabaseNotesRepository'

const emptyUi = {
  myNotesSidebarExpanded: true,
  expandedFolderIds: [] as string[],
  expandedTaskIds: [] as string[],
  expandedSubtaskIds: [] as string[],
  collapsedSubtaskIds: [] as string[],
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function createSelectChain(payload: { data: unknown; error: { message: string } | null }) {
  return {
    order: () => Promise.resolve(payload),
    then(
      onfulfilled?: (value: { data: unknown; error: { message: string } | null }) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(payload).then(onfulfilled, onrejected)
    },
  }
}

function createMockClient(options: {
  tables: Record<string, { data: unknown; error: { message: string } | null }>
  upsertError?: { message: string } | null
  signedIn?: boolean
}): SupabaseClient {
  const upserts: Array<{ table: string; rows: unknown[] }> = []
  const signedIn = options.signedIn !== false
  const client = {
    upserts,
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: signedIn ? { id: '11111111-1111-4111-8111-111111111111' } : null },
          error: signedIn ? null : { message: 'not signed in' },
        }),
    },
    from(table: string) {
      return {
        select: () => createSelectChain(options.tables[table] ?? { data: [], error: null }),
        upsert: (rows: unknown[]) => {
          upserts.push({ table, rows })
          return Promise.resolve({ data: null, error: options.upsertError ?? null })
        },
        delete: () => ({
          in: () => Promise.resolve({ data: null, error: null }),
          eq: () => ({
            select: () => Promise.resolve({ data: [{ id: 'ok' }], error: null }),
          }),
        }),
      }
    },
  }
  return client as unknown as SupabaseClient
}

export function runMapperChecks(): void {
  const folder = folderFromRow({
    id: '11111111-1111-1111-1111-111111111111',
    parent_id: null,
    name: 'Programming',
    is_important: true,
    sort_order: 2,
  })
  assert(folder.parentId === null, 'folder parent_id null maps to parentId')
  assert(folder.isImportant === true, 'is_important maps to isImportant')
  assert(folder.sortOrder === 2, 'sort_order maps to sortOrder')

  const nested = folderFromRow({
    id: '22222222-2222-2222-2222-222222222222',
    parent_id: folder.id,
    name: 'Laravel',
    is_important: false,
    sort_order: 0,
  })
  assert(nested.parentId === folder.id, 'nested folder parent_id maps to parentId')

  const task = taskFromRow({
    id: '33333333-3333-3333-3333-333333333333',
    folder_id: folder.id,
    title: 'Read docs',
    content: 'notes',
    is_important: false,
    is_pinned: false,
    pinned_scopes: [],
    note_kind: 'note',
    due_at: null,
    completed: false,
    completed_at: null,
    tags: [],
        color: null,
        grid_layout: null,
    sort_order: 1,
  })
  assert(task.folderId === folder.id, 'folder_id maps to folderId')
  assert(task.content === 'notes', 'task content is preserved')

  const childSubtask = subtaskFromRow({
    id: '55555555-5555-5555-5555-555555555555',
    task_id: task.id,
    parent_subtask_id: '44444444-4444-4444-4444-444444444444',
    title: 'Nested',
    completed: true,
  })
  assert(childSubtask.taskId === task.id, 'task_id maps to taskId')
  assert(childSubtask.parentSubtaskId === '44444444-4444-4444-4444-444444444444', 'parent_subtask_id maps')

  const attachment = attachmentFromRow({
    id: '66666666-6666-6666-6666-666666666666',
    task_id: task.id,
    type: 'pdf',
    name: 'spec.pdf',
    mime_type: 'application/pdf',
    storage_path: null,
    file_size: 12,
  })
  assert(attachment.taskId === task.id, 'attachment task_id maps')
  assert(attachment.isPdf === true, 'pdf type sets isPdf')
  assert(attachment.previewUrl === '', 'no storage preview yet')

  const snapshot = snapshotFromRows(
    [],
    [
      {
        id: task.id,
        folder_id: folder.id,
        title: task.title,
        content: task.content,
        is_important: false,
        is_pinned: false,
        pinned_scopes: [],
        note_kind: 'note',
        due_at: null,
        completed: false,
        completed_at: null,
        tags: [],
        color: null,
        grid_layout: null,
        sort_order: 1,
      },
    ],
    [],
    emptyUi,
    null,
  )

  assert(snapshot.tasks[0]?.folderId === folder.id, 'snapshot keeps task.folderId')

  const layers = layersByParent([
    { id: 'child', parentId: 'root' },
    { id: 'root', parentId: null },
  ])
  assert(layers[0]?.[0]?.id === 'root', 'root folder upserts first')
  assert(layers[1]?.[0]?.id === 'child', 'child folder upserts after parent')
}

export function assertNotesRepositoryFactory(): void {
  const repo = getNotesRepository()
  if (getSupabaseClient()) {
    assert(repo instanceof ActiveSupabaseNotes, 'authenticated app uses Supabase notes when configured')
    return
  }
  assert(repo instanceof LocalNotesDataRepository, 'LocalStorage remains available without a Supabase client')
}

export async function runSupabaseRepositoryMockChecks(): Promise<void> {
  const folderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const taskId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const parentSubtaskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  const childSubtaskId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

  const client = createMockClient({
    tables: {
      folders: {
        data: [
          {
            id: folderId,
            parent_id: null,
            name: 'Programming',
            is_important: false,
            sort_order: 0,
          },
        ],
        error: null,
      },
      tasks: {
        data: [
          {
            id: taskId,
            folder_id: folderId,
            title: 'Task',
            content: '',
            is_important: true,
            is_pinned: false,
            pinned_scopes: [],
            sort_order: 0,
          },
        ],
        error: null,
      },
      subtasks: {
        data: [
          {
            id: childSubtaskId,
            task_id: taskId,
            parent_subtask_id: parentSubtaskId,
            title: 'Child',
            completed: false,
          },
          {
            id: parentSubtaskId,
            task_id: taskId,
            parent_subtask_id: null,
            title: 'Parent',
            completed: false,
          },
        ],
        error: null,
      },
    },
  })

  const repository = new SupabaseNotesDataRepository(client)
  const snapshot = await repository.load()
  assert(snapshot.folders[0]?.parentId === null, 'loaded root folder')
  assert(snapshot.tasks[0]?.folderId === folderId, 'loaded task stays on folder')
  assert(snapshot.subtasks.find((item) => item.id === childSubtaskId)?.parentSubtaskId === parentSubtaskId, 'nested subtask')

  const failing = createMockClient({
    tables: {
      folders: { data: null, error: { message: 'permission denied for table folders' } },
      tasks: { data: [], error: null },
      subtasks: { data: [], error: null },
    },
  })
  try {
    await new SupabaseNotesDataRepository(failing).load()
    throw new Error('expected load to fail')
  } catch (error) {
    assert(error instanceof RepositoryError, 'supabase failures become RepositoryError')
    assert(
      error instanceof RepositoryError && error.message === 'Could not load folders.',
      'raw database error is not surfaced',
    )
  }

  try {
    await new SupabaseNotesDataRepository(createMockClient({ tables: {}, signedIn: false })).load()
    throw new Error('expected unsigned load to fail')
  } catch (error) {
    assert(error instanceof RepositoryError, 'unsigned load is RepositoryError')
    assert(
      error instanceof RepositoryError && error.message === 'You need to be signed in.',
      'notes repository requires an auth session',
    )
  }
}

export async function runAllRepositoryChecks(): Promise<void> {
  runMapperChecks()
  assertNotesRepositoryFactory()
  await runSupabaseRepositoryMockChecks()
  runAttachmentStorageChecks()
  await runAttachmentHardeningChecks()
  runPersistHardeningChecks()
  runFolderManagementChecks()
  runSearchChecks()
  runSchedulingChecks()
  runTaskEditorChecks()
  await runDeletionChecks()
  runDuplicateDeleteLockCheck()
  runInvalidRecordChecks()
  runMigrationChecks()
  await runMigrationServiceChecks()
  assert(
    toAuthErrorMessage({ message: 'Invalid login credentials' }) === 'Incorrect email or password.',
    'auth errors are user-facing',
  )
  assert(
    toAuthErrorMessage({ message: 'Passwords do not match' }) === 'Passwords do not match.',
    'password mismatch is user-facing',
  )
  assert(
    toAuthErrorMessage({ message: 'permission denied for table folders' }) ===
      'Something went wrong. Please try again.',
    'raw database errors are not shown to users',
  )
}
