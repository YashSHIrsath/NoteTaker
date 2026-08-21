import { RepositoryError } from '../../repositories/errors'
import { beginExclusiveAction, endExclusiveAction } from '../../lib/persistGuard'
import { collectFolderSubtreeIds } from '../../lib/folders'
import { collectTaskIdsInFolders } from '../../lib/tasks'
import { collectSubtaskSubtreeIds } from '../../lib/subtasks'
import { folderDeleteCopy, subtaskDeleteCopy, taskDeleteCopy } from './deleteCopy'
import { NotesDeletionService } from './notesDeletionService'
import type { Folder, Subtask, Task } from '../../types'
import type { AttachmentDataRepository, NotesDataRepository } from '../../repositories/types'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const folders: Folder[] = [
  { id: 'root', name: 'Programming', parentId: null, isImportant: true, sortOrder: 0 },
  { id: 'nested', name: 'Laravel', parentId: 'root', isImportant: false, sortOrder: 0 },
]

const tasks: Task[] = [
  {
    id: 'task-1',
    title: 'Learn React',
    folderId: 'nested',
    content: '',
    isImportant: true,
    sortOrder: 0,
  },
]

const subtasks: Subtask[] = [
  { id: 'hooks', title: 'Learn Hooks', taskId: 'task-1', parentSubtaskId: null, completed: false },
  { id: 'effect', title: 'Practice useEffect', taskId: 'task-1', parentSubtaskId: 'hooks', completed: false },
  { id: 'memo', title: 'Practice useMemo', taskId: 'task-1', parentSubtaskId: 'hooks', completed: false },
]

function createFakeRepos(options?: {
  storageError?: boolean
  notesError?: boolean
  emptyDelete?: boolean
}) {
  const removedPaths: string[] = []
  const deleted: string[] = []
  const notes: NotesDataRepository = {
    load: () => {
      throw new Error('unused')
    },
    save: () => {
      throw new Error('unused')
    },
    deleteFolder: (id) => {
      if (options?.notesError) {
        throw new RepositoryError('Could not delete the folder.')
      }
      if (options?.emptyDelete) {
        throw new RepositoryError('Could not delete the folder.')
      }
      deleted.push(`folder:${id}`)
    },
    deleteTask: (id) => {
      deleted.push(`task:${id}`)
    },
    deleteSubtask: (id) => {
      deleted.push(`subtask:${id}`)
    },
  }
  const attachments: AttachmentDataRepository = {
    createAttachment: () => {
      throw new Error('unused')
    },
    getFile: () => null,
    getPreviewUrl: () => null,
    deleteAttachment: () => {
      throw new Error('unused')
    },
    listAttachments: () => [],
    listStoragePathsForTaskIds: (taskIds) =>
      taskIds.length > 0 ? ['user/task-1/file.png'] : [],
    removeStoragePaths: (paths) => {
      if (options?.storageError) {
        throw new RepositoryError('Could not delete the file.')
      }
      removedPaths.push(...paths)
    },
    clearCache: () => undefined,
  }
  return { notes, attachments, removedPaths, deleted }
}

export async function runDeletionChecks(): Promise<void> {
  const subtree = collectFolderSubtreeIds(folders, 'root')
  assert(subtree.includes('root') && subtree.includes('nested'), 'folder delete includes nested folders')
  const taskIds = collectTaskIdsInFolders(tasks, subtree)
  assert(taskIds[0] === 'task-1', 'folder delete includes nested folder tasks')
  const childIds = collectSubtaskSubtreeIds(subtasks, 'hooks')
  assert(childIds.includes('effect') && childIds.includes('memo'), 'subtask delete includes children')

  const emptyCopy = folderDeleteCopy(folders[1]!, folders, [])
  assert(emptyCopy.description.includes('empty'), 'empty folder uses a simpler confirmation')
  const fullCopy = folderDeleteCopy(folders[0]!, folders, tasks)
  assert(fullCopy.description.includes('attachments'), 'non-empty folder warns about contents')
  assert(taskDeleteCopy(tasks[0]!).description.includes('attachments'), 'task delete warns about attachments')
  const subCopy = subtaskDeleteCopy(subtasks[0]!, subtasks)
  assert(subCopy.description.includes('Practice useEffect'), 'subtask delete lists children')

  const ok = createFakeRepos()
  const service = new NotesDeletionService(ok.notes, ok.attachments)
  await service.deleteFolder('root', folders, tasks)
  assert(ok.removedPaths[0] === 'user/task-1/file.png', 'storage files are removed before the folder row')
  assert(ok.deleted[0] === 'folder:root', 'database folder is deleted after storage cleanup')

  const storageFail = createFakeRepos({ storageError: true })
  try {
    await new NotesDeletionService(storageFail.notes, storageFail.attachments).deleteFolder(
      'root',
      folders,
      tasks,
    )
    throw new Error('expected storage failure')
  } catch (error) {
    assert(error instanceof RepositoryError, 'storage failure is RepositoryError')
    assert(storageFail.deleted.length === 0, 'database is not deleted if storage cleanup fails')
  }

  const notesFail = createFakeRepos({ notesError: true })
  try {
    await new NotesDeletionService(notesFail.notes, notesFail.attachments).deleteFolder(
      'root',
      folders,
      tasks,
    )
    throw new Error('expected notes failure')
  } catch (error) {
    assert(error instanceof RepositoryError, 'notes failure is RepositoryError')
    assert(notesFail.removedPaths.length === 1, 'storage may already be cleaned up if the row delete fails')
    assert(notesFail.deleted.length === 0, 'failed row delete does not update the UI layer')
  }

  const emptyFolder = createFakeRepos()
  await new NotesDeletionService(emptyFolder.notes, emptyFolder.attachments).deleteFolder(
    'nested',
    folders,
    [],
  )
  assert(emptyFolder.removedPaths.length === 0, 'empty folder skips storage cleanup')
  assert(emptyFolder.deleted[0] === 'folder:nested', 'empty folder still deletes the row')

  const otherUser = createFakeRepos({ emptyDelete: true })
  try {
    await new NotesDeletionService(otherUser.notes, otherUser.attachments).deleteFolder(
      'root',
      folders,
      tasks,
    )
    throw new Error('expected foreign delete to fail')
  } catch (error) {
    assert(error instanceof RepositoryError, 'cannot delete another user record')
  }
}

export function runDuplicateDeleteLockCheck(): void {
  const locks = new Set<string>()
  assert(beginExclusiveAction(locks, 'delete-folder:root'), 'first delete is allowed')
  assert(!beginExclusiveAction(locks, 'delete-folder:root'), 'duplicate folder delete is blocked')
  endExclusiveAction(locks, 'delete-folder:root')
  assert(beginExclusiveAction(locks, 'delete-folder:root'), 'delete can retry after the first request finishes')
}
