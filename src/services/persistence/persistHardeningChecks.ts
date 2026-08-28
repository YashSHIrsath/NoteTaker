import { RepositoryError, toRepositoryError } from '../../repositories/errors'
import {
  beginExclusiveAction,
  cloneSnapshot,
  endExclusiveAction,
  shouldApplySessionResult,
  snapshotFromParts,
  UNTITLED,
  UNTITLED_FOLDER,
} from '../../lib/persistGuard'
import { rollbackOps } from '../notes/ops'
import type { Folder } from '../../types'
import type { AppSnapshot } from '../storage/types'

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

function sampleSnapshot(name: string): AppSnapshot {
  return snapshotFromParts(
    [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name,
        parentId: null,
        isImportant: false,
        sortOrder: 0,
      },
    ],
    [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        title: 'Task',
        folderId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        content: 'hello',
        isImportant: false,
        pinnedScopes: [],
        noteKind: 'note',
        dueAt: null,
        completed: false,
        completedAt: null,
        tags: [],
        color: null,
        gridLayouts: null,
        sortOrder: 0,
      },
    ],
    [],
    [],
    emptyUi,
  )
}

export function runPersistHardeningChecks(): void {
  const confirmed = sampleSnapshot('Saved')
  assert(cloneSnapshot(confirmed).folders[0]?.name === 'Saved', 'clone keeps folder name')

  /*
   * A rejected batch puts back the rows it named, and only those.
   *
   * This is what replaced restoring the whole document. An edit made while the request was in
   * flight has to survive the failure — and the same property is what stops one person's rejected
   * title from discarding somebody else's work once a document has two authors.
   */
  const folderId = confirmed.folders[0]!.id
  const taskId = confirmed.tasks[0]!.id
  const edited = {
    folders: [{ ...confirmed.folders[0]!, name: 'Rejected' }],
    tasks: [{ ...confirmed.tasks[0]!, content: 'typed while the request was in flight' }],
    subtasks: [],
    tags: [],
  }
  const restored = rollbackOps({
    lastConfirmed: confirmed,
    current: edited,
    ops: [{ entity: 'folder', action: 'patch', id: folderId, fields: { name: 'Rejected' } }],
  })
  assert(restored.folders[0]?.name === 'Saved', 'a rejected patch restores the row it named')
  assert(
    restored.tasks[0]?.content === 'typed while the request was in flight',
    'a rejected patch leaves rows it never named alone',
  )
  assert(confirmed.folders[0]?.name === 'Saved', 'rollback does not mutate last confirmed')

  // A rejected create has nothing to restore to, so the row it invented leaves.
  const invented: Folder = {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    name: 'Never saved',
    parentId: null,
    isImportant: false,
    sortOrder: 1,
  }
  const afterFailedCreate = rollbackOps({
    lastConfirmed: confirmed,
    current: { ...edited, folders: [...confirmed.folders, invented] },
    ops: [{ entity: 'folder', action: 'create', row: invented }],
  })
  assert(
    !afterFailedCreate.folders.some((folder) => folder.id === invented.id),
    'a rejected create removes the row it invented',
  )

  // And a rejected delete brings the row back with everything that hung off it — restoring an
  // empty folder where a populated one used to be would be its own kind of data loss.
  const afterFailedDelete = rollbackOps({
    lastConfirmed: confirmed,
    current: { folders: [], tasks: [], subtasks: [], tags: [] },
    ops: [{ entity: 'folder', action: 'delete', id: folderId }],
  })
  assert(
    afterFailedDelete.folders.some((folder) => folder.id === folderId),
    'a rejected folder delete restores the folder',
  )
  assert(
    afterFailedDelete.tasks.some((task) => task.id === taskId),
    'a rejected folder delete restores the tasks that were inside it',
  )

  assert(
    shouldApplySessionResult({
      cancelled: false,
      requestUserId: 'user-a',
      currentUserId: 'user-a',
    }),
    'same-session results apply',
  )
  assert(
    !shouldApplySessionResult({
      cancelled: true,
      requestUserId: 'user-a',
      currentUserId: 'user-a',
    }),
    'cancelled results do not apply',
  )
  assert(
    !shouldApplySessionResult({
      cancelled: false,
      requestUserId: 'user-a',
      currentUserId: null,
    }),
    'logged-out results do not apply',
  )
  assert(
    !shouldApplySessionResult({
      cancelled: false,
      requestUserId: 'user-a',
      currentUserId: 'user-b',
    }),
    'other-user results do not apply',
  )

  const locks = new Set<string>()
  assert(beginExclusiveAction(locks, 'create-folder'), 'first create is allowed')
  assert(!beginExclusiveAction(locks, 'create-folder'), 'duplicate create is blocked')
  assert(beginExclusiveAction(locks, 'create-task'), 'a different action is still allowed')
  endExclusiveAction(locks, 'create-folder')
  assert(beginExclusiveAction(locks, 'create-folder'), 'create can retry after the first request finishes')

  const network = toRepositoryError(new TypeError('Failed to fetch'), 'Could not save folders.')
  assert(network instanceof RepositoryError, 'network failures are RepositoryError')
  assert(network.message === 'Could not reach the server.', 'raw network errors are not surfaced')

  const folderCreateFail = toRepositoryError({ message: 'insert failed' }, 'Could not save folders.')
  assert(folderCreateFail.message === 'Could not save folders.', 'failed folder create stays user-facing')
  const taskCreateFail = toRepositoryError({ message: 'insert failed' }, 'Could not save tasks.')
  assert(taskCreateFail.message === 'Could not save tasks.', 'failed task create stays user-facing')
  const updateFail = toRepositoryError({ message: 'update failed' }, 'Could not save notes.')
  assert(updateFail.message === 'Could not save notes.', 'failed update stays user-facing')
  const deleteFail = toRepositoryError({ message: 'delete failed' }, 'Could not delete the attachment.')
  assert(deleteFail.message === 'Could not delete the attachment.', 'failed delete stays user-facing')

  /*
   * A blank name never leaves the client.
   *
   * folders.name, tasks.title and subtasks.title each carry length(btrim(...)) > 0 in the schema,
   * so an empty title is a rejected write rather than a stored blank. The live write path repairs
   * this per op (see repairNames in notesOpsChecks); what is checked here is the snapshot builder,
   * which still guards the empty baseline and the retry that re-applies a rejected batch.
   */
  const blank = sampleSnapshot('   ')
  blank.tasks[0]!.title = ''
  blank.subtasks = [
    {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      taskId: blank.tasks[0]!.id,
      parentSubtaskId: null,
      title: '  ',
      completed: false,
    },
  ]
  const named = snapshotFromParts(blank.folders, blank.tasks, blank.subtasks, blank.tags, emptyUi)
  assert(named.folders[0]?.name === UNTITLED_FOLDER, 'a blank folder name is replaced on the way out')
  assert(named.tasks[0]?.title === UNTITLED, 'a blank task title is replaced on the way out')
  assert(named.subtasks[0]?.title === UNTITLED, 'a whitespace subtask title is replaced on the way out')

  const spaced = snapshotFromParts(
    [{ ...blank.folders[0]!, name: ' Job applications ' }],
    [{ ...blank.tasks[0]!, title: 'Interview ' }],
    [],
    [],
    emptyUi,
  )
  assert(spaced.folders[0]?.name === ' Job applications ', 'padding around a real name is left alone')
  assert(spaced.tasks[0]?.title === 'Interview ', 'a trailing space mid-typing is left alone')

  // A snapshot that needed no fixing comes back as the same array, so nothing downstream has to
  // treat "normalised" and "original" as two different values.
  const clean = snapshotFromParts(confirmed.folders, confirmed.tasks, [], [], emptyUi)
  assert(clean.folders === confirmed.folders, 'a snapshot with no blank names is not rebuilt')
}

export function runInvalidRecordChecks(): void {
  const snapshot = sampleSnapshot('Root')
  const missingFolder = snapshot.folders.find((folder) => folder.id === 'missing')
  const missingTask = snapshot.tasks.find((task) => task.id === 'missing')
  assert(missingFolder === undefined, 'missing folder is not found')
  assert(missingTask === undefined, 'missing task is not found')
}
