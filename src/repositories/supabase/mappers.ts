import { NOTES_STORAGE_VERSION } from '../../services/storage/types'
import type {
  Attachment,
  AttachmentType,
  Folder,
  Subtask,
  NoteKind,
  TaskListScope,
  Tag,
  Task,
  TaskGridLayouts,
  TaskGridPlacement,
} from '../../types'
import { isTaskColor } from '../../lib/taskColor'
import { GRID_SCOPES } from '../../lib/taskGrid'
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

export function folderToRow(folder: Folder): FolderRow {
  return {
    id: folder.id,
    parent_id: folder.parentId ? folder.parentId : null,
    name: folder.name,
    is_important: folder.isImportant,
    sort_order: folder.sortOrder,
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
 *  every field is read on its own and anything that isn't a finite number is simply absent. */
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
): AppSnapshot {
  const tasks = taskRows.map(taskFromRow)

  if (!catalogue) {
    return {
      version: NOTES_STORAGE_VERSION,
      folders: folderRows.map(folderFromRow),
      tasks,
      subtasks: subtaskRows.map(subtaskFromRow),
      tags: [],
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

/** Parents before children so inserts satisfy folder/subtask foreign keys. */
export function layersByParent<T extends { id: string; parentId: string | null }>(items: T[]): T[][] {
  const remaining = new Map(items.map((item) => [item.id, item]))
  const placed = new Set<string>()
  const layers: T[][] = []

  while (remaining.size > 0) {
    const layer = [...remaining.values()].filter(
      (item) => item.parentId === null || placed.has(item.parentId),
    )
    if (layer.length === 0) {
      throw new Error('Cycle or missing parent in nested records.')
    }
    for (const item of layer) {
      remaining.delete(item.id)
      placed.add(item.id)
    }
    layers.push(layer)
  }

  return layers
}
