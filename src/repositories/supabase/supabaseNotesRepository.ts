import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabase'
import { PERSONAL_WORKSPACE, type WorkspaceRef } from '../../lib/workspace'
import { chunkIds } from '../../services/deletion/deleteCopy'
import type { AppSnapshot } from '../../services/storage/types'
import {
  isEmptyPlan,
  planOps,
  type NotesOp,
  type NotesPlan,
} from '../../services/notes/ops'
import { missingColumnName, RepositoryError, toRepositoryError } from '../errors'
import type { NotesDataRepository } from '../types'
import {
  folderPatchToRow,
  folderToRow,
  layersByParent,
  snapshotFromRows,
  subtaskPatchToRow,
  subtaskToRow,
  taskPatchToRow,
  taskToRow,
  type FolderRow,
  type SubtaskRow,
  type TagRow,
  type TaskRow,
  type TaskTagRow,
} from './mappers'
import { loadPersistedUiState, normalizeUiState } from './uiStateStore'

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
  'id,folder_id,title,content,is_important,is_pinned,pinned_scopes,sort_order,note_kind,due_at,completed,completed_at,tags,color,grid_layout'

const FOLDER_COLUMNS = 'id,parent_id,name,is_important,sort_order'
const SUBTASK_COLUMNS = 'id,task_id,parent_subtask_id,title,completed'

/**
 * How many ids go into one `in (...)` filter.
 *
 * Tasks and subtasks are fetched by the ids above them rather than by a workspace column, because
 * the workspace lives on the folder and nowhere else (see WorkspaceRef). That keeps the schema
 * honest at the cost of a URL that grows with the document, so it is chunked.
 */
const ID_FILTER_CHUNK = 200

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

/**
 * How many row updates are in flight at once.
 *
 * A patch is one request per row because each row gets a different value — reordering forty cards
 * is forty different sort orders, which no single statement expresses. Sending all forty at once
 * works but is rude to the connection pool, and sending them one after another costs forty round
 * trips. Phase 1's space_apply() RPC collapses the whole batch into one call; until then this is
 * the honest middle.
 */
const PATCH_CONCURRENCY = 8

/**
 * The catalogue tables are optional at runtime, on purpose.
 *
 * A build can reach a database whose migrations are behind it - that is exactly what the tasks
 * upsert already handles column by column. Tags degrade the same way: the app falls back to the
 * names in each task's own array, which is what it read before this feature existed, and says so
 * once in the console rather than failing a save that has already written the note.
 */
function warnMissingCatalogue(error: { message?: string } | null): void {
  console.warn(
    'Supabase has no tag catalogue yet (' +
      (error?.message ?? 'unknown error') +
      ') - tags are read and written per task instead. Apply the pending migration (npm run db:push) to share them across tasks.',
  )
}

/**
 * The database predates shared spaces.
 *
 * Said once per read rather than thrown, for the same reason the tag catalogue degrades instead of
 * failing: a frontend deploy and a migration are two separate acts, and whichever order they happen
 * in, personal notes have to keep opening. Without the column there are no spaces, so every folder
 * is personal and the unfiltered query is exactly the correct one — which is also precisely what
 * this repository asked for before spaces existed.
 */
function warnMissingSpaces(column: string): void {
  console.warn(
    `Supabase is missing the "${column}" column — this database predates shared spaces, so everything is being read as personal notes. Apply the pending migration (npm run db:push) to enable spaces.`,
  )
}

function throwIfError(error: { message?: string } | null, fallback: string): void {
  if (error) {
    throw toRepositoryError(error, fallback)
  }
}

/** Runs the tasks in order, `limit` at a time, and rejects as soon as one of them does. */
async function inBatches<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < items.length; index += limit) {
    await Promise.all(items.slice(index, index + limit).map(run))
  }
}

/**
 * Supabase Postgres implementation of the notes document contract.
 * Ownership is determined by the Auth session and RLS, never by a UI-supplied user id.
 */
export class SupabaseNotesDataRepository implements NotesDataRepository {
  private readonly client: SupabaseClient
  private readonly workspace: WorkspaceRef

  constructor(
    client: SupabaseClient | null = getSupabaseClient(),
    workspace: WorkspaceRef = PERSONAL_WORKSPACE,
  ) {
    if (!client) {
      throw new RepositoryError('Supabase is not configured.')
    }
    this.client = client
    this.workspace = workspace
  }

  /** The space this repository reads and writes, or null for the account's own notes. */
  private get spaceId(): string | null {
    return this.workspace.kind === 'space' ? this.workspace.id : null
  }

  private async requireSession(): Promise<string> {
    const { data, error } = await this.client.auth.getUser()
    if (error || !data.user) {
      throw new RepositoryError('You need to be signed in.')
    }
    return data.user.id
  }

  /**
   * Reads one workspace, and only that workspace.
   *
   * Filtering is not an optimisation here. RLS lets a member see their personal rows *and* the
   * space's, so an unfiltered read inside a space would hand the flat pages — Starred, Tasks, the
   * deadline spotlight — a mix of both, and personal notes would appear in a shared list. The tree
   * pages would have hidden it, since a personal task's folder is not in the space; the flat ones
   * read straight off the array.
   *
   * Three waves rather than one parallel batch, because the workspace lives on the folder: tasks
   * are the ones in these folders, and subtasks are the ones on those tasks. A single-round-trip
   * version of this is a job for the same RPC that will eventually carry writes.
   */
  async load(): Promise<AppSnapshot> {
    try {
      const userId = await this.requireSession()

      const [folderRows, tagsResult] = await Promise.all([this.selectFolders(), this.selectTags()])
      const folderIds = folderRows.map((row) => row.id)

      const taskRows = await this.selectByIds<TaskRow>(
        'tasks',
        TASK_COLUMNS,
        'folder_id',
        folderIds,
        'Could not load tasks.',
        'sort_order',
      )
      const taskIds = taskRows.map((row) => row.id)

      const [subtaskRows, taskTagsResult] = await Promise.all([
        this.selectByIds<SubtaskRow>(
          'subtasks',
          SUBTASK_COLUMNS,
          'task_id',
          taskIds,
          'Could not load subtasks.',
        ),
        this.selectTaskTags(taskIds),
      ])

      const catalogueError = tagsResult.error ?? taskTagsResult.error
      if (catalogueError) {
        // Not thrown on, unlike folders and tasks: a database without the catalogue migration
        // answers these with an error, and the app is expected to keep working off the tags each
        // task already carries in its own column until `npm run db:push` runs.
        warnMissingCatalogue(catalogueError)
      }

      return snapshotFromRows(
        folderRows,
        taskRows,
        subtaskRows,
        // Keyed by workspace as well as account: expand/collapse is per-device state, and a shared
        // tree's open folders have nothing to do with a personal tree's.
        normalizeUiState(loadPersistedUiState(userId, this.workspace)),
        catalogueError
          ? null
          : {
              tagRows: (tagsResult.data ?? []) as TagRow[],
              taskTagRows: taskTagsResult.rows,
            },
      )
    } catch (error) {
      throw toRepositoryError(error, 'Could not load notes.')
    }
  }

  /**
   * This workspace's folders, or every folder on a database that has no workspaces yet.
   *
   * The retry is not defensive padding: a frontend that filters on a column the database has not
   * been given yet would otherwise fail every load, for personal notes as much as for spaces, until
   * the migration ran. A space cannot degrade — there is nothing for it to be — so that one says so
   * plainly instead of quietly handing back the account's own notes under a space's address.
   */
  private async selectFolders(): Promise<FolderRow[]> {
    const spaceId = this.spaceId
    const scoped = this.client.from('folders').select(FOLDER_COLUMNS)
    const { data, error } = await (spaceId === null
      ? scoped.is('space_id', null)
      : scoped.eq('space_id', spaceId)
    ).order('sort_order', { ascending: true })

    if (!error) {
      return (data ?? []) as FolderRow[]
    }
    const missing = missingColumnName(error)
    if (missing !== 'space_id') {
      throw toRepositoryError(error, 'Could not load folders.')
    }
    if (spaceId !== null) {
      throw new RepositoryError(
        'Shared spaces need a database update. Apply the pending migration (npm run db:push).',
      )
    }
    warnMissingSpaces(missing)
    const retry = await this.client
      .from('folders')
      .select(FOLDER_COLUMNS)
      .order('sort_order', { ascending: true })
    throwIfError(retry.error, 'Could not load folders.')
    return (retry.data ?? []) as FolderRow[]
  }

  /** The same tolerance for the tag catalogue, which is already allowed to be absent entirely. */
  private async selectTags(): Promise<{ data: unknown; error: { message?: string } | null }> {
    const spaceId = this.spaceId
    const scoped = this.client.from('tags').select('id,name')
    const result = await (spaceId === null
      ? scoped.is('space_id', null)
      : scoped.eq('space_id', spaceId)
    ).order('name', { ascending: true })

    if (!result.error || missingColumnName(result.error) !== 'space_id') {
      return result
    }
    return await this.client.from('tags').select('id,name').order('name', { ascending: true })
  }

  /** Rows whose `column` is one of `ids`, in chunks so the query string cannot outgrow the URL. */
  private async selectByIds<Row>(
    table: 'tasks' | 'subtasks',
    columns: string,
    column: string,
    ids: string[],
    fallback: string,
    orderBy?: string,
  ): Promise<Row[]> {
    if (ids.length === 0) {
      return []
    }
    const rows: Row[] = []
    for (const chunk of chunkIds(ids, ID_FILTER_CHUNK)) {
      const query = this.client.from(table).select(columns).in(column, chunk)
      const { data, error } = await (orderBy
        ? // `id` as a secondary key, not as decoration. `sort_order` is unique within a folder and
          // restarts at 0 in the next one, so a listing that spans folders has almost every row
          // tied — and Postgres gives no order to tied rows. Rewriting a row can change which of
          // them comes back first, which meant saving a card's size could reshuffle a page.
          query.order(orderBy, { ascending: true }).order('id', { ascending: true })
        : query)
      throwIfError(error, fallback)
      rows.push(...((data ?? []) as unknown as Row[]))
    }
    return rows
  }

  /** The tag links for these tasks. Soft-fails like the rest of the catalogue: a database without
   *  the migration answers with an error, and the app falls back to each task's own names. */
  private async selectTaskTags(
    taskIds: string[],
  ): Promise<{ rows: TaskTagRow[]; error: { message?: string } | null }> {
    if (taskIds.length === 0) {
      return { rows: [], error: null }
    }
    const rows: TaskTagRow[] = []
    for (const chunk of chunkIds(taskIds, ID_FILTER_CHUNK)) {
      const { data, error } = await this.client
        .from('task_tags')
        .select('task_id,tag_id')
        .in('task_id', chunk)
      if (error) {
        return { rows: [], error }
      }
      rows.push(...((data ?? []) as TaskTagRow[]))
    }
    return { rows, error: null }
  }

  /**
   * Writes one batch of named changes, in the order the database can accept them.
   *
   * What used to be here instead: upsert every row in the document, then select every row the
   * session could see and delete the ones the document didn't mention. That last step is why this
   * had to change — it is a write with an opinion about rows it never loaded, and with two people
   * in one document it silently deletes whatever the sender hadn't heard about yet.
   *
   * The phases exist because rows depend on each other: a tag before anything links to it, a
   * parent folder before its child, leaves deleted before the branches they hang off. Within a
   * phase nothing depends on anything, so those go out together.
   */
  async apply(ops: NotesOp[], intent?: string): Promise<void> {
    if (ops.length === 0) {
      return
    }
    try {
      await this.requireSession()
      const plan = planOps(ops)
      if (isEmptyPlan(plan)) {
        return
      }
      this.requireUuids(plan)

      /*
       * A shared space goes through one function instead of these phases.
       *
       * Not a second mutation model — the same ops, sent whole. Three things only the function can
       * give: the batch is atomic, permission is decided once rather than per row, and the intent is
       * in place before anything is written so the activity triggers can stamp it. Personal notes
       * keep the direct path they have always had, and gain nothing from an RPC.
       */
      if (this.spaceId !== null) {
        await this.applyInSpace(this.spaceId, plan, intent)
        return
      }

      await this.writeTagCreates(plan)
      await this.writeCreates(plan)
      await this.writePatches(plan)
      await this.writeTaskTags(plan)
      await this.writeDeletes(plan)
    } catch (error) {
      throw toRepositoryError(error, 'Could not save notes.')
    }
  }

  /**
   * The plan, flattened back into ops in the order they can be applied.
   *
   * space_apply sorts the phases itself and does not trust the caller for that, but *within* the
   * folder and subtask phases the order still matters — a batch can hold a parent and its child, and
   * the child needs the parent to exist. Which is exactly what layersByParent already answers for
   * the direct path.
   */
  private planToOps(plan: NotesPlan): NotesOp[] {
    const ops: NotesOp[] = []

    for (const row of plan.tagCreates) {
      ops.push({ entity: 'tag', action: 'create', row })
    }
    for (const layer of this.parentLayers(plan.folderCreates)) {
      for (const row of layer) {
        ops.push({ entity: 'folder', action: 'create', row })
      }
    }
    for (const row of plan.taskCreates) {
      ops.push({ entity: 'task', action: 'create', row })
    }
    for (const layer of this.parentLayers(
      plan.subtaskCreates.map((subtask) => ({
        id: subtask.id,
        parentId: subtask.parentSubtaskId,
        subtask,
      })),
    )) {
      for (const item of layer) {
        ops.push({ entity: 'subtask', action: 'create', row: item.subtask })
      }
    }
    for (const { id, fields } of plan.folderPatches) {
      ops.push({ entity: 'folder', action: 'patch', id, fields })
    }
    for (const { id, fields } of plan.taskPatches) {
      ops.push({ entity: 'task', action: 'patch', id, fields })
    }
    for (const { id, fields } of plan.subtaskPatches) {
      ops.push({ entity: 'subtask', action: 'patch', id, fields })
    }
    for (const { taskId, names } of plan.taskTags) {
      ops.push({ entity: 'taskTags', action: 'set', taskId, names })
    }
    for (const id of plan.subtaskDeletes) {
      ops.push({ entity: 'subtask', action: 'delete', id })
    }
    for (const id of plan.taskDeletes) {
      ops.push({ entity: 'task', action: 'delete', id })
    }
    for (const id of plan.folderDeletes) {
      ops.push({ entity: 'folder', action: 'delete', id })
    }
    for (const id of plan.tagDeletes) {
      ops.push({ entity: 'tag', action: 'delete', id })
    }

    return ops
  }

  /** One call, one transaction, one permission decision — and the intent set before any write. */
  private async applyInSpace(
    spaceId: string,
    plan: NotesPlan,
    intent: string | undefined,
  ): Promise<void> {
    const { error } = await this.client.rpc('space_apply', {
      p_space_id: spaceId,
      p_intent: intent ?? null,
      p_ops: this.planToOps(plan),
    })
    throwIfError(error, 'Could not save notes.')
  }

  private requireUuids(plan: NotesPlan): void {
    for (const folder of plan.folderCreates) {
      requireUuid(folder.id, 'Folder id')
      if (folder.parentId) {
        requireUuid(folder.parentId, 'Folder parent id')
      }
    }
    for (const task of plan.taskCreates) {
      requireUuid(task.id, 'Task id')
      requireUuid(task.folderId, 'Task folder id')
    }
    for (const subtask of plan.subtaskCreates) {
      requireUuid(subtask.id, 'Subtask id')
      requireUuid(subtask.taskId, 'Subtask task id')
      if (subtask.parentSubtaskId) {
        requireUuid(subtask.parentSubtaskId, 'Subtask parent id')
      }
    }
    for (const tag of plan.tagCreates) {
      requireUuid(tag.id, 'Tag id')
    }
    for (const patch of plan.folderPatches) {
      requireUuid(patch.id, 'Folder id')
    }
    for (const patch of plan.taskPatches) {
      requireUuid(patch.id, 'Task id')
    }
    for (const patch of plan.subtaskPatches) {
      requireUuid(patch.id, 'Subtask id')
    }
    for (const id of [...plan.folderDeletes, ...plan.taskDeletes, ...plan.subtaskDeletes, ...plan.tagDeletes]) {
      requireUuid(id, 'Id')
    }
  }

  /** First, because task_tags rows below point at these. Missing catalogue tables are survivable;
   *  a note whose tag couldn't be filed is still a note. */
  private async writeTagCreates(plan: NotesPlan): Promise<void> {
    if (plan.tagCreates.length === 0) {
      return
    }
    const { error } = await this.client
      .from('tags')
      .upsert(
        // A space has its own catalogue. Without the stamp, a name typed in a space would be filed
        // against whoever typed it and be invisible to everyone else in the space.
        plan.tagCreates.map((tag) => ({ id: tag.id, name: tag.name, space_id: this.spaceId })),
        { onConflict: 'id' },
      )
    if (error) {
      warnMissingCatalogue(error)
    }
  }

  private async writeCreates(plan: NotesPlan): Promise<void> {
    // Upsert rather than insert so a retry after a half-landed batch is harmless.
    for (const layer of this.parentLayers(plan.folderCreates)) {
      await this.upsertTolerantly(
        'folders',
        layer.map((folder) => folderToRow(folder, this.spaceId)),
        'Could not save folders.',
      )
    }

    if (plan.taskCreates.length > 0) {
      await this.upsertTolerantly('tasks', plan.taskCreates.map(taskToRow), 'Could not save tasks.')
    }

    for (const layer of this.parentLayers(
      plan.subtaskCreates.map((subtask) => ({
        id: subtask.id,
        parentId: subtask.parentSubtaskId,
        subtask,
      })),
    )) {
      const { error } = await this.client
        .from('subtasks')
        .upsert(layer.map((item) => subtaskToRow(item.subtask)), { onConflict: 'id' })
      throwIfError(error, 'Could not save subtasks.')
    }
  }

  /**
   * An upsert, retried without a column this database doesn't have.
   *
   * A migration that hasn't been pushed would otherwise fail the whole write, taking titles and
   * content down with it over a field nobody asked about. The dropped field is named in the console
   * rather than swallowed, since it won't survive a reload until the migration runs.
   *
   * Folders need this as much as tasks now: every folder written carries the workspace it belongs
   * to, so on a database that predates spaces the column in question is `space_id` — and dropping
   * it is exactly right there, because without the column every folder is personal anyway.
   */
  private async upsertTolerantly<Row extends object>(
    table: 'folders' | 'tasks',
    rows: Row[],
    fallback: string,
  ): Promise<void> {
    const { error } = await this.client.from(table).upsert(rows, { onConflict: 'id' })
    const missing = missingColumnName(error)
    if (!missing) {
      throwIfError(error, fallback)
      return
    }
    console.warn(
      `Supabase is missing the "${missing}" column on ${table} — saving without it. Apply the pending migration (npm run db:push) to keep that field.`,
    )
    const trimmed = rows.map((row) => {
      const copy = { ...row } as Record<string, unknown>
      delete copy[missing]
      return copy
    })
    const { error: retryError } = await this.client
      .from(table)
      .upsert(trimmed, { onConflict: 'id' })
    throwIfError(retryError, fallback)
  }

  /**
   * One UPDATE per row, naming only the columns that changed.
   *
   * This is the difference that makes concurrent editing survivable: a title change writes the
   * title column and nothing else, so it cannot carry a stale due date or content over the top of
   * someone else's edit the way a full-row upsert does.
   */
  private async writePatches(plan: NotesPlan): Promise<void> {
    await inBatches(plan.folderPatches, PATCH_CONCURRENCY, async ({ id, fields }) => {
      const row = folderPatchToRow(fields)
      if (Object.keys(row).length === 0) {
        return
      }
      const { error } = await this.client.from('folders').update(row).eq('id', id)
      throwIfError(error, 'Could not save folders.')
    })

    await inBatches(plan.taskPatches, PATCH_CONCURRENCY, async ({ id, fields }) => {
      const row = taskPatchToRow(fields)
      if (Object.keys(row).length === 0) {
        return
      }
      await this.updateTask(id, row)
    })

    await inBatches(plan.subtaskPatches, PATCH_CONCURRENCY, async ({ id, fields }) => {
      const row = subtaskPatchToRow(fields)
      if (Object.keys(row).length === 0) {
        return
      }
      const { error } = await this.client.from('subtasks').update(row).eq('id', id)
      throwIfError(error, 'Could not save subtasks.')
    })
  }

  /** Same missing-column tolerance as the create path, for the same reason. */
  private async updateTask(id: string, row: Partial<TaskRow>): Promise<void> {
    const { error } = await this.client.from('tasks').update(row).eq('id', id)
    const missing = missingColumnName(error)
    if (!missing) {
      throwIfError(error, 'Could not save tasks.')
      return
    }
    console.warn(
      `Supabase is missing the "${missing}" column on tasks — saving without it. Apply the pending migration (npm run db:push) to keep that field.`,
    )
    const trimmed = { ...row } as Record<string, unknown>
    delete trimmed[missing]
    if (Object.keys(trimmed).length === 0) {
      return
    }
    const { error: retryError } = await this.client.from('tasks').update(trimmed).eq('id', id)
    throwIfError(retryError, 'Could not save tasks.')
  }

  /**
   * One task's tag links, rewritten to match the names it now carries.
   *
   * Rebuilt rather than diffed: the join is two uuids with no identity of its own, so working out
   * which associations changed costs more than deleting this task's links and writing the ones that
   * should exist. Only the named tasks are touched — the old code cleared the links of every task
   * in the document, which is the same "opinion about rows I didn't load" problem in miniature.
   */
  private async writeTaskTags(plan: NotesPlan): Promise<void> {
    if (plan.taskTags.length === 0) {
      return
    }

    // This workspace's catalogue only. Resolving a name against the account's personal tags while
    // inside a space would link a shared task to a tag nobody else in the space can see.
    const catalogue = this.client.from('tags').select('id,name')
    const { data, error } = await (this.spaceId === null
      ? catalogue.is('space_id', null)
      : catalogue.eq('space_id', this.spaceId))
    if (error) {
      warnMissingCatalogue(error)
      return
    }
    const idByName = new Map(
      ((data ?? []) as TagRow[]).map((row) => [row.name.trim().toLowerCase(), row.id]),
    )

    const taskIds = plan.taskTags.map((entry) => entry.taskId)
    const { error: clearError } = await this.client.from('task_tags').delete().in('task_id', taskIds)
    if (clearError) {
      warnMissingCatalogue(clearError)
      return
    }

    const links: TaskTagRow[] = []
    for (const { taskId, names } of plan.taskTags) {
      for (const name of names) {
        const tagId = idByName.get(name.trim().toLowerCase())
        // A name with no catalogue entry can only come from a client that predates the catalogue.
        // Dropping the link is right: the association is defined by the catalogue, and the name
        // still sits in the task's own tags column for that older client to keep reading.
        if (tagId) {
          links.push({ task_id: taskId, tag_id: tagId })
        }
      }
    }
    if (links.length === 0) {
      return
    }
    const { error: insertError } = await this.client.from('task_tags').insert(links)
    if (insertError) {
      warnMissingCatalogue(insertError)
    }
  }

  /** Leaves first. The database would cascade anyway, but a batch that deletes a task and one of
   *  its subtasks should not depend on which order the cascade happened to reach them in. */
  private async writeDeletes(plan: NotesPlan): Promise<void> {
    for (const id of plan.subtaskDeletes) {
      await this.deleteRow('subtasks', id, 'Could not delete the subtask.')
    }
    for (const id of plan.taskDeletes) {
      await this.deleteRow('tasks', id, 'Could not delete the task.')
    }
    for (const id of plan.folderDeletes) {
      await this.deleteRow('folders', id, 'Could not delete the folder.')
    }
    for (const id of plan.tagDeletes) {
      const { error } = await this.client.from('tags').delete().eq('id', id)
      if (error) {
        warnMissingCatalogue(error)
      }
    }
  }

  /**
   * Deletes one row and insists it was there.
   *
   * Callers tell "gone now" from "never existed" by whether this throws, so a delete that matched
   * nothing is a failure — unless the row really is absent, which is what the second look
   * establishes. That happens legitimately: a batch that deletes a folder and a task inside it
   * finds the task already gone, cascaded away by the folder a moment earlier.
   */
  private async deleteRow(
    table: 'folders' | 'tasks' | 'subtasks',
    id: string,
    fallback: string,
  ): Promise<void> {
    const { data, error } = await this.client.from(table).delete().eq('id', id).select('id')
    throwIfError(error, fallback)
    if (data && data.length > 0) {
      return
    }
    const { data: still, error: checkError } = await this.client
      .from(table)
      .select('id')
      .eq('id', id)
    throwIfError(checkError, fallback)
    if (still && still.length > 0) {
      throw new RepositoryError(fallback)
    }
  }

  private parentLayers<T extends { id: string; parentId: string | null }>(items: T[]): T[][] {
    if (items.length === 0) {
      return []
    }
    try {
      return layersByParent(items)
    } catch (error) {
      throw new RepositoryError('Could not save notes.', { cause: error })
    }
  }
}
