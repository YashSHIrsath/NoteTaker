import { collectFolderSubtreeIds } from '../../lib/folders'
import { UNTITLED, UNTITLED_FOLDER } from '../../lib/persistGuard'
import { collectSubtaskSubtreeIds } from '../../lib/subtasks'
import { collectTaskIdsInFolders } from '../../lib/tasks'
import type { Folder, Subtask, Tag, Task } from '../../types'
import { NOTES_STORAGE_VERSION, type AppSnapshot } from '../storage/types'

/**
 * What one edit changed, said out loud.
 *
 * The notes document used to be written by handing the whole thing to the repository, which
 * upserted every row and then deleted anything the server had that the snapshot didn't mention.
 * With one author that is correct and pleasantly self-healing. With two it is destructive by
 * default: a second browser that loaded before a folder existed doesn't mention that folder, so
 * its next save deletes it, and `ON DELETE CASCADE` takes the tasks and attachments underneath.
 * No conflict, no error, nothing to find afterwards.
 *
 * So an edit now names itself. Each mutation says which rows it touched and — for a change to an
 * existing row — which *fields*, which is the part that matters: a patch writes only the columns
 * it names, so two people editing the title and the due date of the same note no longer overwrite
 * each other's column with a stale value they happened to be holding.
 *
 * Deletes are ops too, rather than three bespoke repository methods, so there is exactly one way
 * into the document. That is what makes a per-op permission check, a lock and an audit entry
 * possible later without finding every write again.
 */
export type FolderPatch = Partial<Omit<Folder, 'id'>>
export type TaskPatch = Partial<Omit<Task, 'id'>>
export type SubtaskPatch = Partial<Omit<Subtask, 'id'>>

export type NotesOp =
  | { entity: 'folder'; action: 'create'; row: Folder }
  | { entity: 'folder'; action: 'patch'; id: string; fields: FolderPatch }
  | { entity: 'folder'; action: 'delete'; id: string }
  | { entity: 'task'; action: 'create'; row: Task }
  | { entity: 'task'; action: 'patch'; id: string; fields: TaskPatch }
  | { entity: 'task'; action: 'delete'; id: string }
  | { entity: 'subtask'; action: 'create'; row: Subtask }
  | { entity: 'subtask'; action: 'patch'; id: string; fields: SubtaskPatch }
  | { entity: 'subtask'; action: 'delete'; id: string }
  | { entity: 'tag'; action: 'create'; row: Tag }
  | { entity: 'tag'; action: 'delete'; id: string }
  /**
   * The whole set of tag names on one task, not a difference.
   *
   * The join has no identity of its own — two uuids and nothing else — so working out which
   * associations changed costs more than writing the ones that should exist. Names rather than
   * ids because that is what a task carries and what every pill, filter and list in the app reads;
   * the repository resolves them against the catalogue at the boundary.
   */
  | { entity: 'taskTags'; action: 'set'; taskId: string; names: string[] }

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0
}

/**
 * The same ops, with any blank name replaced by the word the empty field already shows as its hint.
 *
 * Applied on the way into the queue rather than at each call site, because a blank name is not only
 * produced by the title field — an import, a migration or a future editor can make one too — and
 * because the database refuses it: `folders.name`, `tasks.title` and `subtasks.title` all carry a
 * `length(btrim(...)) > 0` check.
 *
 * Local state keeps the empty string. That is the point: you are halfway through retyping a title,
 * and having the field fill itself in under the cursor would be worse than saving a placeholder. A
 * name with spaces around it is passed through exactly as typed — `btrim` means the database is
 * content, and trimming here would eat the space someone is standing on partway through
 * "Job applications".
 */
export function repairNames(ops: NotesOp[]): NotesOp[] {
  return ops.map((op) => {
    switch (op.entity) {
      case 'folder': {
        if (op.action === 'create') {
          return isBlank(op.row.name) ? { ...op, row: { ...op.row, name: UNTITLED_FOLDER } } : op
        }
        if (op.action === 'patch' && 'name' in op.fields && isBlank(op.fields.name)) {
          return { ...op, fields: { ...op.fields, name: UNTITLED_FOLDER } }
        }
        return op
      }
      case 'task': {
        if (op.action === 'create') {
          return isBlank(op.row.title) ? { ...op, row: { ...op.row, title: UNTITLED } } : op
        }
        if (op.action === 'patch' && 'title' in op.fields && isBlank(op.fields.title)) {
          return { ...op, fields: { ...op.fields, title: UNTITLED } }
        }
        return op
      }
      case 'subtask': {
        if (op.action === 'create') {
          return isBlank(op.row.title) ? { ...op, row: { ...op.row, title: UNTITLED } } : op
        }
        if (op.action === 'patch' && 'title' in op.fields && isBlank(op.fields.title)) {
          return { ...op, fields: { ...op.fields, title: UNTITLED } }
        }
        return op
      }
      default:
        return op
    }
  })
}

/**
 * One flush's worth of ops, coalesced and sorted into the order they can actually be applied in.
 *
 * Both repositories consume this rather than the raw list, so the rules about what has to happen
 * before what live in one place. Tags exist before anything links to them; a parent folder exists
 * before its child; deletes run from the leaves up, so a row is never orphaned mid-flush even
 * where the database would have cascaded it anyway.
 *
 * `folderCreates` and `subtaskCreates` are in the order the ops arrived, *not* parent-first — a
 * batch can hold a folder and its child. Ordering those is the caller's job because only the
 * Supabase repository needs it (see `layersByParent`); an in-memory array doesn't care.
 */
export interface NotesPlan {
  tagCreates: Tag[]
  folderCreates: Folder[]
  taskCreates: Task[]
  subtaskCreates: Subtask[]
  folderPatches: Array<{ id: string; fields: FolderPatch }>
  taskPatches: Array<{ id: string; fields: TaskPatch }>
  subtaskPatches: Array<{ id: string; fields: SubtaskPatch }>
  taskTags: Array<{ taskId: string; names: string[] }>
  subtaskDeletes: string[]
  taskDeletes: string[]
  folderDeletes: string[]
  tagDeletes: string[]
}

/**
 * What is pending for one row, while the queue is being folded down.
 *
 * `created` and `patch` are both held because they combine: a note created and then renamed twice
 * before the flush is one insert carrying the final name, not an insert followed by two updates.
 */
interface Pending<Row, Patch> {
  created?: Row
  patch?: Patch
  deleted?: boolean
}

function pendingFor<Row, Patch>(
  bucket: Map<string, Pending<Row, Patch>>,
  id: string,
): Pending<Row, Patch> {
  const existing = bucket.get(id)
  if (existing) {
    return existing
  }
  const fresh: Pending<Row, Patch> = {}
  bucket.set(id, fresh)
  return fresh
}

/**
 * The queue, folded into the smallest set of writes that has the same effect.
 *
 * Typing a title produces one op per keystroke and dragging a card produces one per neighbour it
 * displaced, so folding is not an optimisation here — an unfolded flush would send forty updates
 * to the same row and let the server apply them in whatever order the connection delivered.
 *
 * A delete is terminal for its row. Nothing after it is kept, and anything before it is dropped:
 * a row created and deleted within one flush never reaches the server at all, which is right, and
 * a row deleted after being patched needs the delete only. Ids are uuids, so a delete is never
 * followed by that same row coming back.
 */
export function planOps(ops: NotesOp[]): NotesPlan {
  const folders = new Map<string, Pending<Folder, FolderPatch>>()
  const tasks = new Map<string, Pending<Task, TaskPatch>>()
  const subtasks = new Map<string, Pending<Subtask, SubtaskPatch>>()
  const tags = new Map<string, Pending<Tag, never>>()
  const taskTags = new Map<string, string[]>()

  for (const op of ops) {
    switch (op.entity) {
      case 'folder': {
        const id = op.action === 'create' ? op.row.id : op.id
        const pending = pendingFor(folders, id)
        if (pending.deleted) {
          break
        }
        if (op.action === 'create') {
          pending.created = op.row
        } else if (op.action === 'patch') {
          if (pending.created) {
            pending.created = { ...pending.created, ...op.fields }
          } else {
            pending.patch = { ...pending.patch, ...op.fields }
          }
        } else {
          // `created` is carried onto the delete so the emit step below can tell a row that only
          // ever existed in this queue from one the server is holding.
          folders.set(id, { deleted: true, created: pending.created })
        }
        break
      }
      case 'task': {
        const id = op.action === 'create' ? op.row.id : op.id
        const pending = pendingFor(tasks, id)
        if (pending.deleted) {
          break
        }
        if (op.action === 'create') {
          pending.created = op.row
        } else if (op.action === 'patch') {
          if (pending.created) {
            pending.created = { ...pending.created, ...op.fields }
          } else {
            pending.patch = { ...pending.patch, ...op.fields }
          }
        } else {
          tasks.set(id, { deleted: true, created: pending.created })
        }
        break
      }
      case 'subtask': {
        const id = op.action === 'create' ? op.row.id : op.id
        const pending = pendingFor(subtasks, id)
        if (pending.deleted) {
          break
        }
        if (op.action === 'create') {
          pending.created = op.row
        } else if (op.action === 'patch') {
          if (pending.created) {
            pending.created = { ...pending.created, ...op.fields }
          } else {
            pending.patch = { ...pending.patch, ...op.fields }
          }
        } else {
          subtasks.set(id, { deleted: true, created: pending.created })
        }
        break
      }
      case 'tag': {
        const id = op.action === 'create' ? op.row.id : op.id
        const pending = pendingFor(tags, id)
        if (pending.deleted) {
          break
        }
        if (op.action === 'create') {
          pending.created = op.row
        } else {
          tags.set(id, { deleted: true, created: pending.created })
        }
        break
      }
      case 'taskTags': {
        // Last one wins: the op is the whole set, so an earlier one says nothing the later one
        // doesn't already say.
        taskTags.set(op.taskId, op.names)
        break
      }
    }
  }

  const plan: NotesPlan = {
    tagCreates: [],
    folderCreates: [],
    taskCreates: [],
    subtaskCreates: [],
    folderPatches: [],
    taskPatches: [],
    subtaskPatches: [],
    taskTags: [],
    subtaskDeletes: [],
    taskDeletes: [],
    folderDeletes: [],
    tagDeletes: [],
  }

  for (const [id, pending] of tags) {
    if (pending.deleted) {
      // A tag invented and dropped in the same flush was never written, so there is nothing to
      // delete — and asking the server to delete an id it has never seen is an error, not a no-op.
      if (!pending.created) {
        plan.tagDeletes.push(id)
      }
      continue
    }
    if (pending.created) {
      plan.tagCreates.push(pending.created)
    }
  }

  for (const [id, pending] of folders) {
    if (pending.deleted) {
      if (!pending.created) {
        plan.folderDeletes.push(id)
      }
      continue
    }
    if (pending.created) {
      plan.folderCreates.push(pending.created)
    } else if (pending.patch && Object.keys(pending.patch).length > 0) {
      plan.folderPatches.push({ id, fields: pending.patch })
    }
  }

  for (const [id, pending] of tasks) {
    if (pending.deleted) {
      if (!pending.created) {
        plan.taskDeletes.push(id)
      }
      continue
    }
    if (pending.created) {
      plan.taskCreates.push(pending.created)
    } else if (pending.patch && Object.keys(pending.patch).length > 0) {
      plan.taskPatches.push({ id, fields: pending.patch })
    }
  }

  for (const [id, pending] of subtasks) {
    if (pending.deleted) {
      if (!pending.created) {
        plan.subtaskDeletes.push(id)
      }
      continue
    }
    if (pending.created) {
      plan.subtaskCreates.push(pending.created)
    } else if (pending.patch && Object.keys(pending.patch).length > 0) {
      plan.subtaskPatches.push({ id, fields: pending.patch })
    }
  }

  for (const [taskId, names] of taskTags) {
    // A task deleted in this same flush takes its links with it; writing them first would be two
    // round trips to reach the same empty result.
    if (tasks.get(taskId)?.deleted) {
      continue
    }
    plan.taskTags.push({ taskId, names })
  }

  return plan
}

export function isEmptyPlan(plan: NotesPlan): boolean {
  return (
    plan.tagCreates.length === 0 &&
    plan.folderCreates.length === 0 &&
    plan.taskCreates.length === 0 &&
    plan.subtaskCreates.length === 0 &&
    plan.folderPatches.length === 0 &&
    plan.taskPatches.length === 0 &&
    plan.subtaskPatches.length === 0 &&
    plan.taskTags.length === 0 &&
    plan.subtaskDeletes.length === 0 &&
    plan.taskDeletes.length === 0 &&
    plan.folderDeletes.length === 0 &&
    plan.tagDeletes.length === 0
  )
}

/** Nothing to send. Checked before a flush so an edit that cancels itself out costs no request. */
export function hasNoEffect(ops: NotesOp[]): boolean {
  return isEmptyPlan(planOps(ops))
}

/** NoInfer on the patch so the row type is decided by the array alone — inferring from both made
 *  T collapse to `{ id: string }` and lost every other field. */
function replaceById<T extends { id: string }>(
  rows: T[],
  id: string,
  fields: Partial<NoInfer<T>>,
): T[] {
  return rows.map((row) => (row.id === id ? { ...row, ...fields } : row))
}

/**
 * The same ops, applied to a snapshot in memory.
 *
 * Two callers, and they need it for opposite reasons. The LocalStorage repository *is* this
 * function — its whole job is to fold the ops into the stored document. And the Supabase path uses
 * it to move its record of "what the server has confirmed" forward after a successful flush, which
 * is the baseline a failed flush is rolled back to. Deriving that baseline by re-reading local
 * state instead would be wrong: local state has usually moved on by then.
 *
 * Deletes cascade here the way they cascade in the database, because the baseline has to match what
 * the server actually holds — a confirmed snapshot that still listed the tasks under a deleted
 * folder would restore them on the next failure.
 */
export function applyOpsToSnapshot(snapshot: AppSnapshot, ops: NotesOp[]): AppSnapshot {
  const plan = planOps(ops)

  let folders = [...snapshot.folders, ...plan.folderCreates]
  let tasks = [...snapshot.tasks, ...plan.taskCreates]
  let subtasks = [...snapshot.subtasks, ...plan.subtaskCreates]
  let tags = [...snapshot.tags, ...plan.tagCreates]

  for (const { id, fields } of plan.folderPatches) {
    folders = replaceById(folders, id, fields)
  }
  for (const { id, fields } of plan.taskPatches) {
    tasks = replaceById(tasks, id, fields)
  }
  for (const { id, fields } of plan.subtaskPatches) {
    subtasks = replaceById(subtasks, id, fields)
  }
  for (const { taskId, names } of plan.taskTags) {
    tasks = replaceById(tasks, taskId, { tags: names } as Partial<Task>)
  }

  for (const id of plan.subtaskDeletes) {
    const gone = new Set(collectSubtaskSubtreeIds(subtasks, id))
    gone.add(id)
    subtasks = subtasks.filter((subtask) => !gone.has(subtask.id))
  }
  for (const id of plan.taskDeletes) {
    tasks = tasks.filter((task) => task.id !== id)
    subtasks = subtasks.filter((subtask) => subtask.taskId !== id)
  }
  for (const id of plan.folderDeletes) {
    const goneFolders = new Set(collectFolderSubtreeIds(folders, id))
    goneFolders.add(id)
    const goneTasks = new Set(collectTaskIdsInFolders(tasks, goneFolders))
    folders = folders.filter((folder) => !goneFolders.has(folder.id))
    tasks = tasks.filter((task) => !goneTasks.has(task.id))
    subtasks = subtasks.filter((subtask) => !goneTasks.has(subtask.taskId))
  }
  if (plan.tagDeletes.length > 0) {
    const gone = new Set(plan.tagDeletes)
    const goneNames = new Set(
      tags.filter((tag) => gone.has(tag.id)).map((tag) => tag.name.toLowerCase()),
    )
    tags = tags.filter((tag) => !gone.has(tag.id))
    // The name has to leave the tasks too. task_tags cascades in the database, but a task's own
    // `tags` array is plain text with nothing to cascade from — left alone, a deleted tag would
    // reappear on the next load from the array the mapper falls back to.
    tasks = tasks.map((task) =>
      task.tags.some((name) => goneNames.has(name.trim().toLowerCase()))
        ? { ...task, tags: task.tags.filter((name) => !goneNames.has(name.trim().toLowerCase())) }
        : task,
    )
  }

  return {
    version: NOTES_STORAGE_VERSION,
    folders,
    tasks,
    subtasks,
    tags,
    uiState: snapshot.uiState,
  }
}

/** The rows one set of ops could have changed, expanded through the cascades a delete implies. */
interface TouchedRows {
  folders: Set<string>
  tasks: Set<string>
  subtasks: Set<string>
  tags: Set<string>
}

function rowsTouchedByOps(ops: NotesOp[], confirmed: AppSnapshot): TouchedRows {
  const touched: TouchedRows = {
    folders: new Set<string>(),
    tasks: new Set<string>(),
    subtasks: new Set<string>(),
    tags: new Set<string>(),
  }

  for (const op of ops) {
    switch (op.entity) {
      case 'folder': {
        if (op.action === 'delete') {
          // A deleted folder took its subtree with it locally, so putting the folder back without
          // its contents would leave an empty folder where a populated one used to be.
          const folderIds = new Set(collectFolderSubtreeIds(confirmed.folders, op.id))
          folderIds.add(op.id)
          for (const id of folderIds) {
            touched.folders.add(id)
          }
          for (const taskId of collectTaskIdsInFolders(confirmed.tasks, folderIds)) {
            touched.tasks.add(taskId)
          }
          for (const subtask of confirmed.subtasks) {
            if (touched.tasks.has(subtask.taskId)) {
              touched.subtasks.add(subtask.id)
            }
          }
        } else {
          touched.folders.add(op.action === 'create' ? op.row.id : op.id)
        }
        break
      }
      case 'task': {
        const id = op.action === 'create' ? op.row.id : op.id
        touched.tasks.add(id)
        if (op.action === 'delete') {
          for (const subtask of confirmed.subtasks) {
            if (subtask.taskId === id) {
              touched.subtasks.add(subtask.id)
            }
          }
        }
        break
      }
      case 'subtask': {
        const id = op.action === 'create' ? op.row.id : op.id
        touched.subtasks.add(id)
        if (op.action === 'delete') {
          for (const descendant of collectSubtaskSubtreeIds(confirmed.subtasks, id)) {
            touched.subtasks.add(descendant)
          }
        }
        break
      }
      case 'tag': {
        touched.tags.add(op.action === 'create' ? op.row.id : op.id)
        // Deleting a tag strips its name from every task, so those tasks are in play as well.
        if (op.action === 'delete') {
          const name = confirmed.tags.find((tag) => tag.id === op.id)?.name.trim().toLowerCase()
          if (name) {
            for (const task of confirmed.tasks) {
              if (task.tags.some((value) => value.trim().toLowerCase() === name)) {
                touched.tasks.add(task.id)
              }
            }
          }
        }
        break
      }
      case 'taskTags': {
        touched.tasks.add(op.taskId)
        break
      }
    }
  }

  return touched
}

export interface NotesParts {
  folders: Folder[]
  tasks: Task[]
  subtasks: Subtask[]
  tags: Tag[]
}

function restore<T extends { id: string }>(
  current: T[],
  confirmed: T[],
  touched: Set<string>,
): T[] {
  if (touched.size === 0) {
    return current
  }
  const kept = current.filter((row) => !touched.has(row.id))
  const restored = confirmed.filter((row) => touched.has(row.id))
  // Appended rather than slotted back into position: every list in the app reads its own order
  // from sortOrder, so where a row sits in the array decides nothing.
  return [...kept, ...restored]
}

/**
 * Undo a flush that the server rejected — but only the rows that flush touched.
 *
 * This is the part that could not be got right before. The old handler restored the entire
 * document to the last snapshot the server had accepted, which was the only safe move when a
 * write *was* the entire document: one rejected row meant nothing in the batch had landed. It also
 * meant a rejected title threw away every unrelated edit made since the last successful save, and
 * in a shared space it would throw away other people's.
 *
 * Now a flush names its rows, so a failure can put back exactly those and leave everything else —
 * including edits made while the request was in flight — standing.
 */
export function rollbackOps(args: {
  lastConfirmed: AppSnapshot
  current: NotesParts
  ops: NotesOp[]
}): NotesParts {
  const touched = rowsTouchedByOps(args.ops, args.lastConfirmed)
  return {
    folders: restore(args.current.folders, args.lastConfirmed.folders, touched.folders),
    tasks: restore(args.current.tasks, args.lastConfirmed.tasks, touched.tasks),
    subtasks: restore(args.current.subtasks, args.lastConfirmed.subtasks, touched.subtasks),
    tags: restore(args.current.tags, args.lastConfirmed.tags, touched.tags),
  }
}
