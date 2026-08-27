import { RepositoryError, toRepositoryError } from '../../repositories/errors'
import {
  beginExclusiveAction,
  cloneSnapshot,
  endExclusiveAction,
  notesFingerprint,
  rollbackNotesOnSaveFailure,
  shouldApplySessionResult,
  snapshotFromParts,
  UNTITLED,
  UNTITLED_FOLDER,
} from '../../lib/persistGuard'
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
        isPinned: false,
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
  const attempted = sampleSnapshot('Unsaved')
  const outcome = rollbackNotesOnSaveFailure({ lastConfirmed: confirmed, attempted })
  assert(outcome.restored.folders[0]?.name === 'Saved', 'failed save restores last confirmed notes')
  assert(outcome.pendingRetry.folders[0]?.name === 'Unsaved', 'failed save keeps the unsaved snapshot for retry')
  assert(confirmed.folders[0]?.name === 'Saved', 'rollback does not mutate last confirmed')
  assert(cloneSnapshot(confirmed).folders[0]?.name === 'Saved', 'clone keeps folder name')

  attempted.folders[0]!.name = 'Mutated'
  assert(outcome.pendingRetry.folders[0]?.name === 'Unsaved', 'retry snapshot is isolated')

  assert(
    notesFingerprint(confirmed) !== notesFingerprint(attempted),
    'unsaved notes differ from confirmed notes',
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

  const retry = rollbackNotesOnSaveFailure({ lastConfirmed: confirmed, attempted: sampleSnapshot('Retry me') })
  assert(retry.pendingRetry.folders[0]?.name === 'Retry me', 'retry after failure keeps the attempted notes')

  /*
   * A blank name never leaves the client.
   *
   * folders.name, tasks.title and subtasks.title each carry length(btrim(...)) > 0 in the schema.
   * A rejected row rolls the whole document back to the last accepted snapshot, so one empty title
   * does not fail quietly — it undoes whatever else was in the same save. These are the cases the
   * title field can actually produce mid-edit.
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

  // Both sides of the fingerprint comparison are built here, so a snapshot that needed no fixing
  // has to come back identical — otherwise every save would look like a change and loop.
  const clean = snapshotFromParts(confirmed.folders, confirmed.tasks, [], [], emptyUi)
  assert(clean.folders === confirmed.folders, 'a snapshot with no blank names is not rebuilt')
  assert(
    notesFingerprint(snapshotFromParts(named.folders, named.tasks, named.subtasks, [], emptyUi)) ===
      notesFingerprint(named),
    'normalising twice is the same as normalising once',
  )
}

export function runInvalidRecordChecks(): void {
  const snapshot = sampleSnapshot('Root')
  const missingFolder = snapshot.folders.find((folder) => folder.id === 'missing')
  const missingTask = snapshot.tasks.find((task) => task.id === 'missing')
  assert(missingFolder === undefined, 'missing folder is not found')
  assert(missingTask === undefined, 'missing task is not found')
}
