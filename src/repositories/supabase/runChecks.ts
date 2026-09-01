import type { SupabaseClient } from '@supabase/supabase-js'
import { missingColumnName, RepositoryError } from '../errors'
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
import { runNotesOpsChecks } from '../../services/notes/notesOpsChecks'
import { runWorkspaceChecks } from '../../services/workspace/workspaceChecks'
import { runSpacesChecks } from '../../services/spaces/spacesChecks'
import { runActivityChecks } from '../../services/spaces/activityChecks'
import { runAuthFlowChecks } from '../../services/auth/authFlowChecks'
import { runCalendarChecks } from '../../services/ui/calendarChecks'
import { runFontChecks } from '../../services/ui/fontChecks'
import { runSortableChecks } from '../../services/ui/sortableChecks'
import { runTaskFilterChecks } from '../../services/ui/taskFilterChecks'
import { runThemeChecks } from '../../services/ui/themeChecks'
import { runTaskGridChecks } from '../../services/ui/taskGridChecks'
import { PERSONAL_WORKSPACE, spaceWorkspace } from '../../lib/workspace'
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

export interface MockFilter {
  op: 'eq' | 'is' | 'in'
  column: string
  value: unknown
}

export interface MockSelect {
  table: string
  filters: MockFilter[]
}

/**
 * A select that records what it was filtered by, and is both chainable and awaitable.
 *
 * The filters are the interesting part: whether a read is scoped to one workspace is not visible in
 * its result, only in the query it sent. `.order()` returns the chain rather than a promise so the
 * real call shapes — `.select().in().order()` — work in either order.
 */
function createSelectChain(
  payload: { data: unknown; error: { message: string } | null },
  call: MockSelect,
  missingColumn?: string,
) {
  const chain = {
    order: () => chain,
    eq: (column: string, value: unknown) => {
      call.filters.push({ op: 'eq', column, value })
      return chain
    },
    is: (column: string, value: unknown) => {
      call.filters.push({ op: 'is', column, value })
      return chain
    },
    in: (column: string, value: unknown) => {
      call.filters.push({ op: 'in', column, value })
      return chain
    },
    then(
      onfulfilled?: (value: { data: unknown; error: { message: string } | null }) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) {
      // Resolved here rather than at creation, because whether this query is answerable depends on
      // what it was filtered by — which is the whole point of a database that predates a column.
      const usedAbsentColumn =
        missingColumn !== undefined &&
        call.filters.some((filter) => filter.column === missingColumn)
      const result = usedAbsentColumn
        ? {
            data: null,
            error: { message: `column ${call.table}.${missingColumn} does not exist` },
          }
        : payload
      return Promise.resolve(result).then(onfulfilled, onrejected)
    },
  }
  return chain
}

interface MockWrites {
  upserts: Array<{ table: string; rows: unknown[] }>
  updates: Array<{ table: string; row: Record<string, unknown> }>
  inserts: Array<{ table: string; rows: unknown[] }>
  selects: MockSelect[]
  rpcs: Array<{ name: string; args: Record<string, unknown> }>
}

function createMockClient(options: {
  tables: Record<string, { data: unknown; error: { message: string } | null }>
  upsertError?: { message: string } | null
  updateError?: { message: string } | null
  /** Makes every delete match no rows, the way a delete refused by RLS does. */
  emptyDelete?: boolean
  /**
   * A column this database has not been given yet.
   *
   * Reads that filter on it and writes that carry it fail the way Postgres and PostgREST actually
   * fail — which is the state of any deploy where the frontend went out before the migration.
   */
  missingColumn?: string
  signedIn?: boolean
}): SupabaseClient {
  const upserts: MockWrites['upserts'] = []
  const updates: MockWrites['updates'] = []
  const inserts: MockWrites['inserts'] = []
  const selects: MockSelect[] = []
  const rpcs: MockWrites['rpcs'] = []
  const signedIn = options.signedIn !== false
  const client = {
    upserts,
    updates,
    inserts,
    selects,
    rpcs,
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args })
      return Promise.resolve({ data: null, error: null })
    },
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: signedIn ? { id: '11111111-1111-4111-8111-111111111111' } : null },
          error: signedIn ? null : { message: 'not signed in' },
        }),
    },
    from(table: string) {
      return {
        select: () => {
          const call: MockSelect = { table, filters: [] }
          selects.push(call)
          return createSelectChain(
            options.tables[table] ?? { data: [], error: null },
            call,
            options.missingColumn,
          )
        },
        upsert: (rows: unknown[]) => {
          upserts.push({ table, rows })
          const absent = options.missingColumn
          if (
            absent !== undefined &&
            (rows as Array<Record<string, unknown>>).some((row) => absent in row)
          ) {
            return Promise.resolve({
              data: null,
              error: { message: `column ${table}.${absent} does not exist` },
            })
          }
          return Promise.resolve({ data: null, error: options.upsertError ?? null })
        },
        update: (row: Record<string, unknown>) => {
          updates.push({ table, row })
          return {
            eq: () => Promise.resolve({ data: null, error: options.updateError ?? null }),
          }
        },
        insert: (rows: unknown[]) => {
          inserts.push({ table, rows })
          return Promise.resolve({ data: null, error: null })
        },
        delete: () => ({
          in: () => Promise.resolve({ data: null, error: null }),
          eq: () => ({
            select: () =>
              Promise.resolve({ data: options.emptyDelete ? [] : [{ id: 'ok' }], error: null }),
          }),
        }),
      }
    },
  }
  return client as unknown as SupabaseClient
}

function writesOf(client: SupabaseClient): MockWrites {
  return client as unknown as MockWrites
}

function selectsOf(client: SupabaseClient): MockSelect[] {
  return writesOf(client).selects
}

function filtered(
  client: SupabaseClient,
  table: string,
  op: MockFilter['op'],
  column: string,
): MockFilter | undefined {
  return selectsOf(client)
    .find((call) => call.table === table)
    ?.filters.find((filter) => filter.op === op && filter.column === column)
}

function upsertedRows(client: SupabaseClient, table: string): Array<Record<string, unknown>> {
  return (writesOf(client).upserts.find((entry) => entry.table === table)?.rows ?? []) as Array<
    Record<string, unknown>
  >
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

  // The case the ordering rule used to reject outright: one new subfolder under a parent that is
  // already in the database and so is nowhere in the batch. This threw 'missing parent', which
  // failed the whole write — creating a subfolder was impossible for as long as that held.
  const intoExisting = layersByParent([{ id: 'child', parentId: 'saved-last-week' }])
  assert(intoExisting.length === 1, 'a create whose parent is not in the batch needs one layer')
  assert(intoExisting[0]?.[0]?.id === 'child', 'it upserts immediately, not never')

  // A parent in the batch still has to be written first, and a genuine cycle is still refused.
  let cycled = false
  try {
    layersByParent([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ])
  } catch {
    cycled = true
  }
  assert(cycled, 'a cycle inside one batch is still rejected')
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

/**
 * What the write path actually puts on the wire.
 *
 * The interesting assertion is the narrow one: a patch has to reach the database as an UPDATE
 * naming only the columns that changed. A full-row write would carry every other column along with
 * it — which is how a stale copy of a note overwrites somebody else's edit to a different field.
 */
export async function runSupabaseApplyChecks(): Promise<void> {
  const folderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const taskId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const tagId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

  const client = createMockClient({ tables: {} })
  await new SupabaseNotesDataRepository(client).apply([
    { entity: 'task', action: 'patch', id: taskId, fields: { title: 'Renamed' } },
  ])
  const patched = writesOf(client).updates
  assert(patched.length === 1, 'a patch is one update')
  assert(patched[0]?.table === 'tasks', 'a task patch updates tasks')
  assert(Object.keys(patched[0]?.row ?? {}).length === 1, 'a patch sends only the columns it named')
  assert(patched[0]?.row.title === 'Renamed', 'the named column carries the new value')
  assert(writesOf(client).upserts.length === 0, 'a patch does not upsert a whole row')

  // Pinning writes the derived legacy flag alongside the per-scope array, so a client reading only
  // is_pinned still sees the truth.
  const pinning = createMockClient({ tables: {} })
  await new SupabaseNotesDataRepository(pinning).apply([
    { entity: 'task', action: 'patch', id: taskId, fields: { pinnedScopes: ['important'] } },
  ])
  const pinRow = writesOf(pinning).updates[0]?.row ?? {}
  assert(pinRow.is_pinned === true, 'a per-scope pin also writes the derived flag')

  // completedAt is server-owned: ticking a box must not send a browser's clock reading.
  const ticked = createMockClient({ tables: {} })
  await new SupabaseNotesDataRepository(ticked).apply([
    { entity: 'task', action: 'patch', id: taskId, fields: { completed: true } },
  ])
  const tickRow = writesOf(ticked).updates[0]?.row ?? {}
  assert(tickRow.completed === true, 'the tick is sent')
  assert(!('completed_at' in tickRow), 'the completion timestamp is left to the server')

  const created = createMockClient({ tables: {} })
  await new SupabaseNotesDataRepository(created).apply([
    {
      entity: 'folder',
      action: 'create',
      row: { id: folderId, name: 'Programming', parentId: null, isImportant: false, sortOrder: 0 },
    },
  ])
  assert(writesOf(created).upserts[0]?.table === 'folders', 'a create upserts the whole row')

  // Tag links: the catalogue is read to resolve names to ids, then this task's links are rebuilt.
  const linked = createMockClient({ tables: { tags: { data: [{ id: tagId, name: 'Job' }], error: null } } })
  await new SupabaseNotesDataRepository(linked).apply([
    { entity: 'taskTags', action: 'set', taskId, names: ['Job'] },
  ])
  const links = writesOf(linked).inserts.find((entry) => entry.table === 'task_tags')
  assert(links !== undefined, 'tag links are written')
  assert(links?.rows.length === 1, 'one link per resolved name')

  // A delete that matched nothing while the row is still there is a refusal, and has to say so —
  // the deletion service tells "gone" from "never there" by whether this rejects.
  const refused = createMockClient({
    tables: { tasks: { data: [{ id: taskId }], error: null } },
    emptyDelete: true,
  })
  try {
    await new SupabaseNotesDataRepository(refused).apply([
      { entity: 'task', action: 'delete', id: taskId },
    ])
    throw new Error('expected the refused delete to fail')
  } catch (error) {
    assert(error instanceof RepositoryError, 'a refused delete is a RepositoryError')
    assert(
      error instanceof RepositoryError && error.message === 'Could not delete the task.',
      'a refused delete stays user-facing',
    )
  }

  // But a delete that matched nothing because the row is genuinely gone is not a failure: a batch
  // deleting a folder and a task inside it finds the task already cascaded away.
  const alreadyGone = createMockClient({
    tables: { tasks: { data: [], error: null } },
    emptyDelete: true,
  })
  await new SupabaseNotesDataRepository(alreadyGone).apply([
    { entity: 'task', action: 'delete', id: taskId },
  ])

  const idle = createMockClient({ tables: {} })
  await new SupabaseNotesDataRepository(idle).apply([])
  assert(
    writesOf(idle).updates.length === 0 && writesOf(idle).upserts.length === 0,
    'an empty batch costs no request',
  )
}

/**
 * A workspace is a scope on the queries, and this is where that is visible.
 *
 * RLS lets a member see their own rows *and* the space's, so a read inside a space that forgot to
 * filter would hand the flat pages — Starred, Tasks, the deadline spotlight — a mix of both, and
 * personal notes would show up in a shared list. The tree pages would have hidden it, because a
 * personal task's folder is not in the space; the flat ones read straight off the array. So the
 * filter is a correctness property, not a performance one, and it is asserted on the query rather
 * than on the result.
 */
export async function runWorkspaceScopedReadChecks(): Promise<void> {
  const spaceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const folderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const taskId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const tagId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

  const tables = {
    folders: {
      data: [{ id: folderId, parent_id: null, name: 'Root', is_important: false, sort_order: 0 }],
      error: null,
    },
    tasks: {
      data: [
        {
          id: taskId,
          folder_id: folderId,
          title: 'Task',
          content: '',
          is_important: false,
          is_pinned: false,
          pinned_scopes: [],
          sort_order: 0,
          note_kind: 'note',
          due_at: null,
          completed: false,
          completed_at: null,
          tags: [],
          color: null,
          grid_layout: null,
        },
      ],
      error: null,
    },
    subtasks: { data: [], error: null },
    tags: { data: [], error: null },
    task_tags: { data: [], error: null },
  }

  const personal = createMockClient({ tables })
  await new SupabaseNotesDataRepository(personal, PERSONAL_WORKSPACE).load()
  const personalScope = filtered(personal, 'folders', 'is', 'space_id')
  assert(personalScope !== undefined, 'a personal load filters folders on space_id')
  assert(personalScope?.value === null, 'a personal load asks for folders with no space')
  assert(
    filtered(personal, 'tags', 'is', 'space_id')?.value === null,
    'a personal load reads the personal tag catalogue',
  )

  const space = createMockClient({ tables })
  await new SupabaseNotesDataRepository(space, spaceWorkspace(spaceId)).load()
  assert(
    filtered(space, 'folders', 'eq', 'space_id')?.value === spaceId,
    "a space load asks only for that space's folders",
  )
  assert(
    filtered(space, 'tags', 'eq', 'space_id')?.value === spaceId,
    "a space load reads the space's own tag catalogue",
  )
  // Tasks and subtasks have no workspace column: the workspace lives on the folder and nowhere
  // else, so they are reached through the rows above them.
  assert(
    filtered(space, 'tasks', 'in', 'folder_id') !== undefined,
    'tasks are fetched by the folders of the workspace, not by a column of their own',
  )
  assert(
    filtered(space, 'subtasks', 'in', 'task_id') !== undefined,
    'subtasks are fetched by those tasks',
  )
  assert(
    filtered(space, 'task_tags', 'in', 'task_id') !== undefined,
    'tag links are fetched by those tasks',
  )

  // An empty workspace asks nothing further. Without the guard, `.in('folder_id', [])` would fetch
  // every task the session can read — which in a space is a personal document.
  const empty = createMockClient({ tables: { folders: { data: [], error: null } } })
  await new SupabaseNotesDataRepository(empty, spaceWorkspace(spaceId)).load()
  assert(
    !selectsOf(empty).some((call) => call.table === 'tasks'),
    'a workspace with no folders does not ask for tasks',
  )

  /*
   * A shared write goes through one function, not through the table.
   *
   * This is the phase 3 write path: the same ops, sent whole, so the batch is atomic, permission is
   * decided once, and the intent is in place before anything is written for the activity triggers to
   * stamp. The space stamp moved with it — the function sets space_id from its own argument, which is
   * one fewer thing a client can get wrong.
   */
  const spaceWrite = createMockClient({ tables: {} })
  await new SupabaseNotesDataRepository(spaceWrite, spaceWorkspace(spaceId)).apply(
    [
      {
        entity: 'folder',
        action: 'create',
        row: { id: folderId, name: 'Shared', parentId: null, isImportant: false, sortOrder: 0 },
      },
      { entity: 'tag', action: 'create', row: { id: tagId, name: 'Job' } },
    ],
    'Created a folder',
  )
  const call = writesOf(spaceWrite).rpcs[0]
  assert(call?.name === 'space_apply', 'a shared write goes through space_apply')
  assert(call?.args.p_space_id === spaceId, 'and names the space it is for')
  assert(call?.args.p_intent === 'Created a folder', 'and carries the intent')
  assert(
    writesOf(spaceWrite).upserts.length === 0 && writesOf(spaceWrite).updates.length === 0,
    'and touches no table directly',
  )
  const sentOps = (call?.args.p_ops ?? []) as Array<Record<string, unknown>>
  assert(sentOps.length === 2, 'both ops are sent')
  // Tags first: a link cannot point at a catalogue entry that does not exist yet.
  assert(sentOps[0]?.entity === 'tag', 'tags are ordered before anything that references them')
  assert(sentOps[1]?.entity === 'folder', 'then the folder')
  assert(
    !('space_id' in ((sentOps[1]?.row ?? {}) as Record<string, unknown>)),
    'the client does not stamp the space; the function does',
  )

  // Personal notes keep the direct path they have always had, untouched by any of this.
  const personalWrite = createMockClient({ tables: {} })
  await new SupabaseNotesDataRepository(personalWrite, PERSONAL_WORKSPACE).apply([
    {
      entity: 'folder',
      action: 'create',
      row: { id: folderId, name: 'Mine', parentId: null, isImportant: false, sortOrder: 0 },
    },
  ])
  assert(
    upsertedRows(personalWrite, 'folders')[0]?.space_id === null,
    'a personal folder is stamped with no space',
  )
  assert(
    writesOf(personalWrite).rpcs.length === 0,
    'and personal notes never go near space_apply',
  )

  /*
   * A patch never carries a workspace: which workspace a folder is in is fixed for its life, and the
   * database refuses to change it, so sending it would be a write that can only be rejected.
   *
   * Asserted on the op rather than on an UPDATE, because a shared patch no longer becomes one — it
   * is an element of the batch space_apply receives. Checking `updates` here would pass for the wrong
   * reason, by finding nothing at all.
   */
  const patched = createMockClient({ tables: {} })
  await new SupabaseNotesDataRepository(patched, spaceWorkspace(spaceId)).apply([
    { entity: 'folder', action: 'patch', id: folderId, fields: { name: 'Renamed' } },
  ])
  const patchOps = (writesOf(patched).rpcs[0]?.args.p_ops ?? []) as Array<Record<string, unknown>>
  assert(patchOps.length === 1, 'the patch is sent as one op')
  const patchFields = (patchOps[0]?.fields ?? {}) as Record<string, unknown>
  assert(patchFields.name === 'Renamed', 'naming the field it changed')
  assert(!('space_id' in patchFields), 'and not trying to move the folder between workspaces')
  assert(!('spaceId' in patchFields), 'under either spelling')

  /*
   * A database that predates spaces.
   *
   * A frontend deploy and a migration are two separate acts, and this is the window between them.
   * It has already happened once: filtering on space_id against a database without the column made
   * every load fail with "Could not load folders", which took personal notes down as thoroughly as
   * spaces. Personal has to degrade to what it did before; a space cannot, and has to say why.
   */
  const behind = createMockClient({ tables, missingColumn: 'space_id' })
  const degraded = await new SupabaseNotesDataRepository(behind, PERSONAL_WORKSPACE).load()
  assert(
    degraded.folders.length === 1,
    'personal notes still load on a database that has no space_id column',
  )
  assert(degraded.tasks.length === 1, 'and so do their tasks')
  assert(
    selectsOf(behind).filter((call) => call.table === 'folders').length === 2,
    'the folders read is retried without the filter it could not use',
  )

  const behindSpace = createMockClient({ tables, missingColumn: 'space_id' })
  let refused = false
  try {
    await new SupabaseNotesDataRepository(behindSpace, spaceWorkspace(spaceId)).load()
  } catch (error) {
    refused = true
    assert(error instanceof RepositoryError, 'an unmigrated space load is a RepositoryError')
    assert(
      error instanceof RepositoryError && error.message.includes('db:push'),
      'and it says which command fixes it',
    )
  }
  assert(refused, 'a space does not silently degrade into the account\'s own notes')

  // The same tolerance on the way out: a folder write drops the column and keeps the folder.
  const behindWrite = createMockClient({ tables: {}, missingColumn: 'space_id' })
  await new SupabaseNotesDataRepository(behindWrite, PERSONAL_WORKSPACE).apply([
    {
      entity: 'folder',
      action: 'create',
      row: { id: folderId, name: 'Mine', parentId: null, isImportant: false, sortOrder: 0 },
    },
  ])
  const folderUpserts = writesOf(behindWrite).upserts.filter((entry) => entry.table === 'folders')
  assert(folderUpserts.length === 2, 'the folder write is retried without the absent column')
  assert(
    !('space_id' in ((folderUpserts[1]?.rows[0] ?? {}) as Record<string, unknown>)),
    'the retry drops space_id and saves the folder anyway',
  )
}

/** Both ways a database that is behind reports it, since they arrive from different layers. */
export function runMissingColumnMessageChecks(): void {
  assert(
    missingColumnName({ message: "Could not find the 'space_id' column of 'folders' in the schema cache" }) ===
      'space_id',
    "PostgREST's schema cache message is recognised",
  )
  assert(
    missingColumnName({ message: 'column folders.space_id does not exist' }) === 'space_id',
    "Postgres's 42703 message is recognised",
  )
  assert(
    missingColumnName({ message: 'column "space_id" of relation "folders" does not exist' }) ===
      'space_id',
    'the quoted relation form is recognised',
  )
  assert(
    missingColumnName({ message: 'permission denied for table folders' }) === null,
    'an unrelated failure is not read as a missing column',
  )
}

export async function runAllRepositoryChecks(): Promise<void> {
  runMapperChecks()
  assertNotesRepositoryFactory()
  await runSupabaseRepositoryMockChecks()
  runNotesOpsChecks()
  runWorkspaceChecks()
  await runSpacesChecks()
  await runActivityChecks()
  runAuthFlowChecks()
  runCalendarChecks()
  runSortableChecks()
  runTaskGridChecks()
  runTaskFilterChecks()
  runThemeChecks()
  runFontChecks()
  runMissingColumnMessageChecks()
  await runSupabaseApplyChecks()
  await runWorkspaceScopedReadChecks()
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
