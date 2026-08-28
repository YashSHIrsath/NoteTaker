import { UNTITLED, UNTITLED_FOLDER } from '../../lib/persistGuard'
import type { Folder, Subtask, Tag, Task } from '../../types'
import { NOTES_STORAGE_VERSION, type AppSnapshot } from '../storage/types'
import {
  applyOpsToSnapshot,
  hasNoEffect,
  planOps,
  repairNames,
  rollbackOps,
  type NotesOp,
} from './ops'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const FOLDER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FOLDER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const TASK_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TASK_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SUBTASK_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const SUBTASK_CHILD = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const TAG_A = '11111111-1111-4111-8111-111111111111'

function folder(id: string, name: string, parentId: string | null = null): Folder {
  return { id, name, parentId, isImportant: false, sortOrder: 0 }
}

function task(id: string, title: string, folderId: string, tags: string[] = []): Task {
  return {
    id,
    title,
    folderId,
    content: '',
    isImportant: false,
    pinnedScopes: [],
    noteKind: 'note',
    dueAt: null,
    completed: false,
    completedAt: null,
    tags,
    color: null,
    gridLayouts: null,
    sortOrder: 0,
  }
}

function subtask(id: string, title: string, taskId: string, parentSubtaskId: string | null = null): Subtask {
  return { id, title, taskId, parentSubtaskId, completed: false }
}

function snapshot(parts?: Partial<Pick<AppSnapshot, 'folders' | 'tasks' | 'subtasks' | 'tags'>>): AppSnapshot {
  return {
    version: NOTES_STORAGE_VERSION,
    folders: parts?.folders ?? [folder(FOLDER_A, 'Programming')],
    tasks: parts?.tasks ?? [task(TASK_A, 'Learn React', FOLDER_A)],
    subtasks: parts?.subtasks ?? [subtask(SUBTASK_A, 'Hooks', TASK_A)],
    tags: parts?.tags ?? [],
    uiState: {
      myNotesSidebarExpanded: true,
      expandedFolderIds: [],
      expandedTaskIds: [],
      expandedSubtaskIds: [],
      collapsedSubtaskIds: [],
    },
  }
}

/**
 * The queue folds down to the smallest set of writes with the same effect.
 *
 * Typing produces one op per keystroke and a drag produces one per displaced neighbour, so this is
 * not an optimisation: an unfolded flush would send forty updates for one row and let the server
 * apply them in whatever order the connection delivered.
 */
function checkCoalescing(): void {
  const createThenRename = planOps([
    { entity: 'task', action: 'create', row: task(TASK_A, 'First', FOLDER_A) },
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'Second' } },
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'Third' } },
  ])
  assert(createThenRename.taskCreates.length === 1, 'a create plus patches is one insert')
  assert(createThenRename.taskPatches.length === 0, 'patches merged into the create are not sent again')
  assert(createThenRename.taskCreates[0]?.title === 'Third', 'the insert carries the final value')

  const twoPatches = planOps([
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'One' } },
    { entity: 'task', action: 'patch', id: TASK_A, fields: { content: 'Body' } },
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'Two' } },
  ])
  assert(twoPatches.taskPatches.length === 1, 'repeated patches to one row become one update')
  assert(twoPatches.taskPatches[0]?.fields.title === 'Two', 'the last value for a field wins')
  assert(twoPatches.taskPatches[0]?.fields.content === 'Body', 'a field patched once is kept')

  const patchThenDelete = planOps([
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'Doomed' } },
    { entity: 'task', action: 'delete', id: TASK_A },
  ])
  assert(patchThenDelete.taskPatches.length === 0, 'a row deleted later is not patched first')
  assert(patchThenDelete.taskDeletes[0] === TASK_A, 'the delete still goes out')

  /*
   * Created and deleted before either reached the server: nothing at all.
   *
   * Sending the delete would be asking the server to remove an id it has never seen, which is an
   * error rather than a no-op — and would surface as a failed save for an action the person
   * completed and then undid.
   */
  const inventedAndDropped = planOps([
    { entity: 'folder', action: 'create', row: folder(FOLDER_B, 'Scratch') },
    { entity: 'folder', action: 'patch', id: FOLDER_B, fields: { name: 'Renamed' } },
    { entity: 'folder', action: 'delete', id: FOLDER_B },
  ])
  assert(inventedAndDropped.folderCreates.length === 0, 'a row invented and dropped is never inserted')
  assert(inventedAndDropped.folderDeletes.length === 0, 'a row invented and dropped is never deleted')
  assert(
    hasNoEffect([
      { entity: 'folder', action: 'create', row: folder(FOLDER_B, 'Scratch') },
      { entity: 'folder', action: 'delete', id: FOLDER_B },
    ]),
    'an edit that cancels itself out costs no request',
  )

  // Ops after a delete are dropped. Ids are uuids, so a deleted row never comes back under the
  // same id, and a patch to one could only ever fail.
  const afterDelete = planOps([
    { entity: 'task', action: 'delete', id: TASK_A },
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'Too late' } },
  ])
  assert(afterDelete.taskPatches.length === 0, 'a patch after a delete is dropped')

  const tagLinks = planOps([
    { entity: 'taskTags', action: 'set', taskId: TASK_A, names: ['Job'] },
    { entity: 'taskTags', action: 'set', taskId: TASK_A, names: ['Job', 'Urgent'] },
  ])
  assert(tagLinks.taskTags.length === 1, 'the whole tag set is written once')
  assert(tagLinks.taskTags[0]?.names.length === 2, 'the latest tag set wins')

  const linksForDeletedTask = planOps([
    { entity: 'taskTags', action: 'set', taskId: TASK_A, names: ['Job'] },
    { entity: 'task', action: 'delete', id: TASK_A },
  ])
  assert(
    linksForDeletedTask.taskTags.length === 0,
    'links for a task deleted in the same batch are not written first',
  )
}

/** Parents, tags and leaves in an order the database will accept. */
function checkOrdering(): void {
  const plan = planOps([
    { entity: 'tag', action: 'create', row: { id: TAG_A, name: 'Job' } },
    { entity: 'task', action: 'create', row: task(TASK_B, 'Child task', FOLDER_B) },
    { entity: 'folder', action: 'create', row: folder(FOLDER_B, 'Parent') },
    { entity: 'subtask', action: 'create', row: subtask(SUBTASK_A, 'Step', TASK_B) },
    { entity: 'subtask', action: 'delete', id: SUBTASK_CHILD },
    { entity: 'task', action: 'delete', id: TASK_A },
    { entity: 'folder', action: 'delete', id: FOLDER_A },
  ])
  assert(plan.tagCreates.length === 1, 'tags are planned before the links that point at them')
  assert(plan.folderCreates.length === 1, 'folder creates are planned')
  assert(plan.taskCreates.length === 1, 'task creates are planned')
  assert(plan.subtaskCreates.length === 1, 'subtask creates are planned')
  assert(plan.subtaskDeletes.length === 1, 'subtask deletes are planned')
  assert(plan.taskDeletes.length === 1, 'task deletes are planned')
  assert(plan.folderDeletes.length === 1, 'folder deletes are planned')
}

/**
 * The property the whole change exists for.
 *
 * The old write path upserted the entire document and then deleted every row the document did not
 * mention. A batch has no opinion about rows it never names — which is what makes a second author
 * survivable, and what makes this the one check worth reading if only one is.
 */
function checkUnnamedRowsSurvive(): void {
  const before = snapshot({
    folders: [folder(FOLDER_A, 'Mine'), folder(FOLDER_B, 'Theirs')],
    tasks: [task(TASK_A, 'Mine', FOLDER_A), task(TASK_B, 'Theirs', FOLDER_B)],
    subtasks: [],
  })
  const after = applyOpsToSnapshot(before, [
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'Mine, renamed' } },
  ])
  assert(after.tasks.length === 2, 'a batch does not delete rows it never mentioned')
  assert(
    after.tasks.find((item) => item.id === TASK_B)?.title === 'Theirs',
    "another author's row is untouched by a batch that does not name it",
  )
  assert(
    after.folders.some((item) => item.id === FOLDER_B),
    "another author's folder is untouched by a batch that does not name it",
  )
  assert(
    after.tasks.find((item) => item.id === TASK_A)?.title === 'Mine, renamed',
    'the patched row does change',
  )
  // A patch names fields, not a whole row, so the fields it leaves out keep their values.
  assert(
    after.tasks.find((item) => item.id === TASK_A)?.folderId === FOLDER_A,
    'a patch leaves the columns it does not name alone',
  )
}

/** Deletes cascade in memory the way they cascade in the database, because the confirmed baseline
 *  has to match what the server actually holds. */
function checkCascades(): void {
  const before = snapshot({
    folders: [folder(FOLDER_A, 'Root'), folder(FOLDER_B, 'Nested', FOLDER_A)],
    tasks: [task(TASK_A, 'In nested', FOLDER_B)],
    subtasks: [subtask(SUBTASK_A, 'Step', TASK_A), subtask(SUBTASK_CHILD, 'Substep', TASK_A, SUBTASK_A)],
  })

  const afterFolder = applyOpsToSnapshot(before, [
    { entity: 'folder', action: 'delete', id: FOLDER_A },
  ])
  assert(afterFolder.folders.length === 0, 'deleting a folder takes its nested folders')
  assert(afterFolder.tasks.length === 0, 'deleting a folder takes the tasks inside it')
  assert(afterFolder.subtasks.length === 0, 'deleting a folder takes those tasks’ subtasks')

  const afterTask = applyOpsToSnapshot(before, [{ entity: 'task', action: 'delete', id: TASK_A }])
  assert(afterTask.tasks.length === 0, 'deleting a task removes it')
  assert(afterTask.subtasks.length === 0, 'deleting a task takes its subtasks')
  assert(afterTask.folders.length === 2, 'deleting a task leaves the folders standing')

  const afterSubtask = applyOpsToSnapshot(before, [
    { entity: 'subtask', action: 'delete', id: SUBTASK_A },
  ])
  assert(afterSubtask.subtasks.length === 0, 'deleting a subtask takes its descendants')
  assert(afterSubtask.tasks.length === 1, 'deleting a subtask leaves its task')
}

/**
 * A deleted tag has to leave the tasks as well as the catalogue.
 *
 * task_tags cascades from the tag, but a task's own `tags` array is plain text with nothing to
 * cascade from. Left alone, the deleted name reappears on the next load out of the array the mapper
 * falls back to when the join has nothing for that task.
 */
function checkTagDelete(): void {
  const tag: Tag = { id: TAG_A, name: 'Job' }
  const before = snapshot({
    tasks: [task(TASK_A, 'Applications', FOLDER_A, ['Job', 'Urgent'])],
    tags: [tag],
  })
  const after = applyOpsToSnapshot(before, [{ entity: 'tag', action: 'delete', id: TAG_A }])
  assert(after.tags.length === 0, 'the tag leaves the catalogue')
  assert(after.tasks[0]?.tags.length === 1, 'the deleted name leaves the task')
  assert(after.tasks[0]?.tags[0] === 'Urgent', 'the other names on the task stay')
}

/** A blank name is repaired on the way into the queue, and left alone on screen. */
function checkNameRepair(): void {
  const repaired = repairNames([
    { entity: 'folder', action: 'create', row: folder(FOLDER_A, '   ') },
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: '' } },
    { entity: 'subtask', action: 'create', row: subtask(SUBTASK_A, '', TASK_A) },
  ])
  const [folderOp, taskOp, subtaskOp] = repaired
  assert(
    folderOp?.entity === 'folder' && folderOp.action === 'create' && folderOp.row.name === UNTITLED_FOLDER,
    'a blank folder name is replaced on the way out',
  )
  assert(
    taskOp?.entity === 'task' && taskOp.action === 'patch' && taskOp.fields.title === UNTITLED,
    'a title cleared mid-edit is sent as Untitled rather than rejected',
  )
  assert(
    subtaskOp?.entity === 'subtask' && subtaskOp.action === 'create' && subtaskOp.row.title === UNTITLED,
    'a blank subtask title is replaced on the way out',
  )

  const padded = repairNames([
    { entity: 'folder', action: 'patch', id: FOLDER_A, fields: { name: ' Job applications ' } },
  ])
  const paddedOp = padded[0]
  assert(
    paddedOp?.entity === 'folder' && paddedOp.action === 'patch' && paddedOp.fields.name === ' Job applications ',
    'padding around a real name is left exactly as typed',
  )

  // Fields the repair has no business touching must come back identical.
  const untouched = repairNames([
    { entity: 'task', action: 'patch', id: TASK_A, fields: { content: '   ' } },
  ])
  const untouchedOp = untouched[0]
  assert(
    untouchedOp?.entity === 'task' && untouchedOp.action === 'patch' && untouchedOp.fields.content === '   ',
    'a whitespace note body is not a name and is left alone',
  )
}

/** The baseline advances by the batch that landed, so a later failure rolls back to the truth. */
function checkBaselineAdvance(): void {
  const confirmed = snapshot({ subtasks: [] })
  const batch: NotesOp[] = [
    { entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'Saved once' } },
  ]
  const advanced = applyOpsToSnapshot(confirmed, batch)
  const rolledBack = rollbackOps({
    lastConfirmed: advanced,
    current: {
      folders: advanced.folders,
      tasks: advanced.tasks.map((item) => ({ ...item, title: 'Rejected' })),
      subtasks: advanced.subtasks,
      tags: advanced.tags,
    },
    ops: [{ entity: 'task', action: 'patch', id: TASK_A, fields: { title: 'Rejected' } }],
  })
  assert(
    rolledBack.tasks[0]?.title === 'Saved once',
    'a failure after a successful flush rolls back to what that flush wrote, not to the load',
  )
}

export function runNotesOpsChecks(): void {
  checkCoalescing()
  checkOrdering()
  checkUnnamedRowsSurvive()
  checkCascades()
  checkTagDelete()
  checkNameRepair()
  checkBaselineAdvance()
}
