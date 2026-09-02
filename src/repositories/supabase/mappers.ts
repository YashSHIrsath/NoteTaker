import { NOTES_STORAGE_VERSION } from '../../services/storage/types'
import type {
  Attachment,
  AttachmentType,
  ContentSharing,
  Folder,
  ShareableEntity,
  Subtask,
  NoteKind,
  TaskListScope,
  Tag,
  Task,
  TaskGridLayouts,
  TaskGridPlacement,
} from '../../types'
import { toVisibility } from '../../lib/contentPrivacy'
import { isTaskColor } from '../../lib/taskColor'
import { GRID_SCOPES } from '../../lib/taskGrid'
import type { FolderPatch, SubtaskPatch, TaskPatch } from '../../services/notes/ops'
import type { AppSnapshot, UiState } from '../types'

export interface FolderRow {
  id: string
  parent_id: string | null
  name: string
  is_important: boolean
  sort_order: number
}

export interface TaskRow {
  id: string
  folder_id: string
  title: string
  content: string
  is_important: boolean
  is_pinned: boolean
  pinned_scopes: string[]
  sort_order: number
  note_kind: string
  due_at: string | null
  completed: boolean
  completed_at: string | null
  tags: string[]
  color: string | null
  grid_layout: unknown
}

export interface TagRow {
  id: string
  name: string
}

/** The join row. Nothing but its two ends — an association has no properties of its own. */
export interface TaskTagRow {
  task_id: string
  tag_id: string
}

export function tagFromRow(row: TagRow): Tag {
  return { id: row.id, name: row.name }
}

export interface SubtaskRow {
  id: string
  task_id: string
  parent_subtask_id: string | null
  title: string
  completed: boolean
}

export function folderFromRow(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    isImportant: row.is_important,
    sortOrder: row.sort_order,
  }
}

/**
 * The two privacy columns, kept off the row types above rather than added to them.
 *
 * FolderRow and TaskRow are what gets *written* on the personal path — folderToRow and taskToRow
 * return them — and neither of these columns is ever written from the client: owner_id is stamped
 * from the session and visibility is frozen except through set_content_visibility(). Folding them
 * into the write shapes would mean sending two values the server discards, and would make it look as
 * though the client had a say.
 *
 * They are only read, and only inside a space. A personal workspace has one reader, so there is
 * nothing for a visibility to mean — which is also why a database that predates this migration never
 * has these columns asked for on the path it can still serve.
 */
export interface ContentPrivacyColumns {
  visibility: string | null
  owner_id: string | null
}

export type FolderReadRow = FolderRow & ContentPrivacyColumns
export type TaskReadRow = TaskRow & ContentPrivacyColumns

/** One row of the grant table, as it comes back. Its RLS policy means the reader only ever receives
 *  rows for items they can already reach, so nothing here needs filtering. */
export interface ContentShareRow {
  entity_type: string
  entity_id: string
  user_id: string
}

/**
 * The sharing state of everything in the loaded workspace, assembled from the three sources it
 * arrives in: the folders' own columns, the tasks' own columns, and the grant rows.
 *
 * `canManage` is decided here rather than asked of the server, and this is the one place in the app
 * where a permission is computed client-side — so it is worth being exact about what it is for. It
 * decides whether to *offer* the share sheet. Every path it guards is enforced again in
 * set_content_visibility(), which refuses anybody but the owner, so the worst a wrong answer here can
 * do is show a control that then declines. It is never the thing keeping anyone out.
 */
export function sharingFromRows(
  folderRows: FolderReadRow[],
  taskRows: TaskReadRow[],
  shareRows: ContentShareRow[],
  viewerId: string,
): ContentSharing[] {
  const grants = new Map<string, string[]>()
  for (const row of shareRows) {
    const key = `${row.entity_type}:${row.entity_id}`
    const existing = grants.get(key)
    if (existing) {
      existing.push(row.user_id)
    } else {
      grants.set(key, [row.user_id])
    }
  }

  const entry = (
    entityType: ShareableEntity,
    id: string,
    row: ContentPrivacyColumns,
  ): ContentSharing => ({
    entityType,
    entityId: id,
    visibility: toVisibility(row.visibility),
    ownerId: row.owner_id,
    canManage: row.owner_id !== null && row.owner_id === viewerId,
    sharedWith: grants.get(`${entityType}:${id}`) ?? [],
  })

  return [
    ...folderRows.map((row) => entry('folder', row.id, row)),
    ...taskRows.map((row) => entry('task', row.id, row)),
  ]
}

/**
 * A folder row on the way out, including which workspace it belongs to.
 *
 * `space_id` is not on the domain object and never will be. A folder in a space is not a different
 * kind of folder — it is the same folder in a different scope, and the scope belongs to whatever is
 * doing the reading and writing, not to the row as the UI understands it. The repository knows its
 * own workspace and stamps it here; the 43 components that render folders stay unaware that spaces
 * exist at all.
 */
export interface FolderWriteRow extends FolderRow {
  space_id: string | null
}

/** `spaceId` is required rather than optional on purpose: an omitted argument would silently write
 *  a personal folder, which inside a space is a folder nobody in it can see. */
export function folderToRow(folder: Folder, spaceId: string | null): FolderWriteRow {
  return {
    id: folder.id,
    parent_id: folder.parentId ? folder.parentId : null,
    name: folder.name,
    is_important: folder.isImportant,
    sort_order: folder.sortOrder,
    space_id: spaceId,
  }
}

/** Anything that isn't the task marker is a plain note — the same forgiving read the database's
 *  own normalising trigger does, so an unknown value can't strand a row in a third state. */
function toNoteKind(value: string): NoteKind {
  return value === 'due_task' ? 'due_task' : 'note'
}

/**
 * The listings this note is pinned in.
 *
 * Falls back to the old single flag when the column is absent or empty on a row written before
 * pinning was per-listing: one flag meant "pinned everywhere", so that is what it becomes. Reading
 * it as "pinned nowhere" would silently unpin every card on the first load after deploying.
 */
function toPinnedScopes(value: unknown, legacyFlag: boolean): TaskListScope[] {
  const scopes = Array.isArray(value)
    ? GRID_SCOPES.filter((scope) => (value as unknown[]).includes(scope))
    : []
  if (scopes.length > 0) {
    return [...scopes]
  }
  return legacyFlag ? [...GRID_SCOPES] : []
}

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    content: row.content,
    isImportant: row.is_important,
    pinnedScopes: toPinnedScopes(row.pinned_scopes, row.is_pinned),
    sortOrder: row.sort_order,
    noteKind: toNoteKind(row.note_kind),
    dueAt: row.due_at,
    completed: row.completed === true,
    completedAt: row.completed_at,
    tags: Array.isArray(row.tags) ? row.tags : [],
    color: isTaskColor(row.color) ? row.color : null,
    gridLayouts: toGridLayouts(row.grid_layout),
  }
}

export function taskToRow(task: Task): TaskRow {
  return {
    id: task.id,
    folder_id: task.folderId,
    title: task.title,
    content: task.content,
    is_important: task.isImportant,
    // Derived by the database too (see the per-scope pinning migration); sent so the row is
    // complete, and so a client reading only the old flag still sees the truth.
    is_pinned: task.pinnedScopes.length > 0,
    pinned_scopes: task.pinnedScopes,
    sort_order: task.sortOrder,
    note_kind: task.noteKind,
    due_at: task.dueAt,
    completed: task.completed,
    // Sent so the row shape stays complete, but the server does not take it: a trigger stamps
    // completed_at from its own clock and keeps whatever is already there. See the migration.
    completed_at: task.completedAt,
    tags: task.tags,
    color: task.color,
    grid_layout: task.gridLayouts,
  }
}

/** jsonb comes back as `unknown`, and a hand-edited or half-written row shouldn't crash a load:
 *  every field is read on its own and anything of the wrong shape is simply absent. */
function toPlacement(value: unknown): TaskGridPlacement | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const source = value as Record<string, unknown>
  const placement: TaskGridPlacement = {}
  for (const key of ['v', 'w', 'h', 'order'] as const) {
    const number = source[key]
    if (typeof number === 'number' && Number.isFinite(number)) {
      placement[key] = number
    }
  }
  // Which folder an `order` was minted in — see TaskGridPlacement.orderFolderId. Read on its own
  // rather than with the numbers above because it is the one field that isn't one, and dropped
  // when blank: an empty string is not a folder, and treating it as one would make every
  // folder-scope order stop applying at once.
  const orderFolderId = source.orderFolderId
  if (typeof orderFolderId === 'string' && orderFolderId.length > 0) {
    placement.orderFolderId = orderFolderId
  }
  return Object.keys(placement).length > 0 ? placement : null
}

/**
 * The stored arrangements, in either shape the column has held.
 *
 * Rows written before arrangements were split per listing hold a bare `{x,y,w,h}` — one size that
 * was being shown in all three listings, so it becomes the starting point for all three here. The
 * cards stay exactly as they were and only diverge once one of them is resized; reading the old
 * shape as "no arrangement" would silently reset every card anyone had ever sized. The x and y in
 * those rows are dropped rather than carried across: they were written but never read back, and
 * placement has been the packer's job throughout.
 */
function toGridLayouts(value: unknown): TaskGridLayouts | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const source = value as Record<string, unknown>
  const legacy = toPlacement(source)
  if (legacy) {
    return { folder: legacy, tasks: legacy, important: legacy }
  }
  const layouts: TaskGridLayouts = {}
  for (const scope of GRID_SCOPES) {
    const placement = toPlacement(source[scope])
    if (placement) {
      layouts[scope] = placement
    }
  }
  return Object.keys(layouts).length > 0 ? layouts : null
}

export function subtaskFromRow(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    title: row.title,
    taskId: row.task_id,
    parentSubtaskId: row.parent_subtask_id,
    completed: row.completed,
  }
}

export function subtaskToRow(subtask: Subtask): SubtaskRow {
  return {
    id: subtask.id,
    task_id: subtask.taskId,
    parent_subtask_id: subtask.parentSubtaskId,
    title: subtask.title,
    completed: subtask.completed,
  }
}

/* ------------------------------------------------------------------ patches
 *
 * A patch names the fields that changed and nothing else, and these mappers keep it that way: a
 * key absent from the patch is absent from the row, so the column is left alone rather than
 * rewritten with whatever the sender happened to be holding. That is the whole point of patching
 * over upserting a full row — two people editing different columns of the same note stop
 * overwriting each other.
 *
 * Presence is tested with `in`, never truthiness. Every one of these fields has a legitimate
 * falsy value: a cleared due date is null, an unticked box is false, an emptied note is ''.
 */

export function folderPatchToRow(fields: FolderPatch): Partial<FolderRow> {
  const row: Partial<FolderRow> = {}
  if ('name' in fields) {
    row.name = fields.name
  }
  if ('parentId' in fields) {
    row.parent_id = fields.parentId ? fields.parentId : null
  }
  if ('isImportant' in fields) {
    row.is_important = fields.isImportant
  }
  if ('sortOrder' in fields) {
    row.sort_order = fields.sortOrder
  }
  return row
}

export function taskPatchToRow(fields: TaskPatch): Partial<TaskRow> {
  const row: Partial<TaskRow> = {}
  if ('title' in fields) {
    row.title = fields.title
  }
  if ('folderId' in fields) {
    row.folder_id = fields.folderId
  }
  if ('content' in fields) {
    row.content = fields.content
  }
  if ('isImportant' in fields) {
    row.is_important = fields.isImportant
  }
  if ('pinnedScopes' in fields) {
    row.pinned_scopes = fields.pinnedScopes
    // The old single flag is derived, here and in the database both, so a client reading only
    // `is_pinned` still sees the truth after a per-scope change.
    row.is_pinned = (fields.pinnedScopes ?? []).length > 0
  }
  if ('sortOrder' in fields) {
    row.sort_order = fields.sortOrder
  }
  if ('noteKind' in fields) {
    row.note_kind = fields.noteKind
  }
  if ('dueAt' in fields) {
    row.due_at = fields.dueAt
  }
  if ('completed' in fields) {
    row.completed = fields.completed
  }
  if ('tags' in fields) {
    row.tags = fields.tags
  }
  if ('color' in fields) {
    row.color = fields.color
  }
  if ('gridLayouts' in fields) {
    row.grid_layout = fields.gridLayouts
  }
  // completedAt is deliberately not mappable. It is stamped by normalize_task_schedule from the
  // server's own clock, which is what separates "finished before the deadline" from "finished two
  // hours after it"; a browser sending its own value could only ever be ignored or believed, and
  // both are worse than not asking.
  return row
}

export function subtaskPatchToRow(fields: SubtaskPatch): Partial<SubtaskRow> {
  const row: Partial<SubtaskRow> = {}
  if ('title' in fields) {
    row.title = fields.title
  }
  if ('taskId' in fields) {
    row.task_id = fields.taskId
  }
  if ('parentSubtaskId' in fields) {
    row.parent_subtask_id = fields.parentSubtaskId
  }
  if ('completed' in fields) {
    row.completed = fields.completed
  }
  return row
}

export interface AttachmentRow {
  id: string
  task_id: string
  type: AttachmentType
  name: string
  mime_type: string
  storage_path: string | null
  file_size: number | null
}

export function attachmentFromRow(row: AttachmentRow, previewUrl = '', taskId = row.task_id): Attachment {
  return {
    id: row.id,
    taskId,
    type: row.type,
    name: row.name,
    mimeType: row.mime_type,
    isImage: row.type === 'image',
    isPdf: row.type === 'pdf',
    isDocument: row.type !== 'image' && row.type !== 'pdf',
    previewUrl,
  }
}

export function attachmentToRow(
  attachment: Attachment,
  extras?: { storagePath?: string | null; fileSize?: number | null },
): AttachmentRow {
  return {
    id: attachment.id,
    task_id: attachment.taskId,
    type: attachment.type,
    name: attachment.name,
    mime_type: attachment.mimeType,
    storage_path: extras?.storagePath ?? null,
    file_size: extras?.fileSize ?? null,
  }
}

/**
 * Rows in, snapshot out — with each task's tags resolved from the join.
 *
 * `tagRows` is null when the catalogue tables aren't there yet (a database this migration hasn't
 * been pushed to). In that case every task keeps the names in its own `tags` array, which is
 * exactly what it had before, so the app runs unchanged until `npm run db:push`.
 */
export function snapshotFromRows(
  folderRows: FolderRow[],
  taskRows: TaskRow[],
  subtaskRows: SubtaskRow[],
  uiState: UiState,
  catalogue: { tagRows: TagRow[]; taskTagRows: TaskTagRow[] } | null,
  /** Who can see what, for a space. Empty — and omitted by every caller outside one — for personal
   *  notes, where there is nobody else to see anything. */
  sharing: ContentSharing[] = [],
): AppSnapshot {
  const tasks = taskRows.map(taskFromRow)

  if (!catalogue) {
    return {
      version: NOTES_STORAGE_VERSION,
      folders: folderRows.map(folderFromRow),
      tasks,
      subtasks: subtaskRows.map(subtaskFromRow),
      tags: [],
      sharing,
      uiState,
    }
  }

  const nameById = new Map(catalogue.tagRows.map((row) => [row.id, row.name]))
  const namesByTask = new Map<string, string[]>()
  for (const link of catalogue.taskTagRows) {
    const name = nameById.get(link.tag_id)
    if (!name) {
      continue
    }
    const names = namesByTask.get(link.task_id)
    if (names) {
      names.push(name)
    } else {
      namesByTask.set(link.task_id, [name])
    }
  }

  return {
    version: NOTES_STORAGE_VERSION,
    folders: folderRows.map(folderFromRow),
    // The join wins where there is one, and the task's own array is the fallback where there
    // isn't. Both halves matter. Preferring the join stops a task last written by a client that
    // predates the catalogue from dragging its stale array back over associations made since;
    // falling back to the array is what carries a task whose links were never written — the
    // one-time local-to-Supabase migration inserts tasks and their arrays but knows nothing about
    // task_tags, and without this every tag on a migrated account would vanish on first load.
    //
    // The two cannot disagree by accident: this client writes the array on every save from the
    // same names it writes the links from, so "no links but a non-empty array" only ever means
    // "nothing has written links for this task yet".
    tasks: tasks.map((task) => {
      const linked = namesByTask.get(task.id)
      return { ...task, tags: (linked ?? task.tags).slice().sort() }
    }),
    subtasks: subtaskRows.map(subtaskFromRow),
    // Completed with anything the tasks reference but the catalogue doesn't have yet — the
    // migrated account above, again. A name a task carries has to exist as a tag or the next save
    // would find no catalogue entry for it, write no link, and quietly drop it. Freshly minted ids
    // are settled by that save; nothing points at a tag by id, so a temporary one costs nothing.
    tags: completeCatalogue(catalogue.tagRows.map(tagFromRow), tasks),
    sharing,
    uiState,
  }
}

function completeCatalogue(tags: Tag[], tasks: Task[]): Tag[] {
  const known = new Set(tags.map((tag) => tag.name.toLowerCase()))
  const completed = [...tags]
  for (const task of tasks) {
    for (const raw of task.tags) {
      const name = raw.trim()
      const key = name.toLowerCase()
      if (name && !known.has(key)) {
        known.add(key)
        completed.push({ id: crypto.randomUUID(), name })
      }
    }
  }
  return completed.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Parents before children so inserts satisfy folder/subtask foreign keys.
 *
 * Only a parent that is *in this batch* has to wait its turn. A parent that isn't is one that
 * already exists in the database, and it is by far the common case: creating a subfolder inside a
 * folder saved last week sends exactly one row, whose parent is a row nobody is writing. Treating
 * that as unplaceable is what made the first layer come out empty and the whole write fail as a
 * cycle — so a batch that created a folder tree worked and creating a single subfolder never did.
 */
export function layersByParent<T extends { id: string; parentId: string | null }>(items: T[]): T[][] {
  const batch = new Set(items.map((item) => item.id))
  const remaining = new Map(items.map((item) => [item.id, item]))
  const placed = new Set<string>()
  const layers: T[][] = []

  while (remaining.size > 0) {
    const layer = [...remaining.values()].filter(
      (item) =>
        item.parentId === null || !batch.has(item.parentId) || placed.has(item.parentId),
    )
    if (layer.length === 0) {
      // Everything left is waiting on something else in the same batch, so they are waiting on
      // each other. A parent missing entirely is no longer reachable from here.
      throw new Error('Cycle in nested records.')
    }
    for (const item of layer) {
      remaining.delete(item.id)
      placed.add(item.id)
    }
    layers.push(layer)
  }

  return layers
}
