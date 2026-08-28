import { RepositoryError } from '../../repositories/errors'
import type { AttachmentDataRepository, NotesDataRepository } from '../../repositories/types'
import type { Folder, Subtask, Task } from '../../types'
import { collectFolderSubtreeIds } from '../../lib/folders'
import { collectTaskIdsInFolders } from '../../lib/tasks'
import { collectSubtaskSubtreeIds } from '../../lib/subtasks'
import { chunkIds } from './deleteCopy'
import type { NotesOp } from '../notes/ops'
import { WRITE_INTENT } from '../../lib/writeIntent'

export interface FolderDeleteResult {
  parentId: string | null
  deletedFolderIds: string[]
  deletedTaskIds: string[]
}

export interface TaskDeleteResult {
  folderId: string
  deletedTaskIds: string[]
}

export class NotesDeletionService {
  private readonly notes: NotesDataRepository
  private readonly attachments: AttachmentDataRepository

  constructor(notes: NotesDataRepository, attachments: AttachmentDataRepository) {
    this.notes = notes
    this.attachments = attachments
  }

  async deleteFolder(folderId: string, folders: Folder[], tasks: Task[]): Promise<FolderDeleteResult> {
    const folder = folders.find((item) => item.id === folderId)
    if (!folder) {
      throw new RepositoryError('Could not delete the folder.')
    }
    const deletedFolderIds = collectFolderSubtreeIds(folders, folderId)
    const deletedTaskIds = collectTaskIdsInFolders(tasks, deletedFolderIds)
    await this.removeFilesForTasks(deletedTaskIds)
    await this.applyDelete({ entity: 'folder', action: 'delete', id: folderId }, WRITE_INTENT.folderDeleted)
    return {
      parentId: folder.parentId,
      deletedFolderIds,
      deletedTaskIds,
    }
  }

  async deleteTask(taskId: string, tasks: Task[]): Promise<TaskDeleteResult> {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) {
      throw new RepositoryError('Could not delete the task.')
    }
    await this.removeFilesForTasks([taskId])
    await this.applyDelete({ entity: 'task', action: 'delete', id: taskId }, WRITE_INTENT.taskDeleted)
    return {
      folderId: task.folderId,
      deletedTaskIds: [taskId],
    }
  }

  async deleteSubtask(subtaskId: string, subtasks: Subtask[]): Promise<string[]> {
    if (!subtasks.some((item) => item.id === subtaskId)) {
      throw new RepositoryError('Could not delete the subtask.')
    }
    const ids = collectSubtaskSubtreeIds(subtasks, subtaskId)
    await this.applyDelete({ entity: 'subtask', action: 'delete', id: subtaskId }, WRITE_INTENT.subtaskDeleted)
    return ids
  }

  /**
   * Sends one delete and waits for it, rather than queueing it with the ordinary edits.
   *
   * The caller only removes the rows from local state once this resolves, and it has to be able to
   * tell "deleted" from "wasn't there" — which the repository answers by rejecting a delete that
   * matched nothing. A queued op would resolve long after the decision had been made.
   */
  private async applyDelete(op: NotesOp, intent: string): Promise<void> {
    await Promise.resolve(this.notes.apply([op], intent))
  }

  private async removeFilesForTasks(taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) {
      return
    }
    const paths: string[] = []
    for (const chunk of chunkIds(taskIds)) {
      const found = await Promise.resolve(this.attachments.listStoragePathsForTaskIds(chunk))
      paths.push(...found)
    }
    await Promise.resolve(this.attachments.removeStoragePaths(paths))
  }
}
