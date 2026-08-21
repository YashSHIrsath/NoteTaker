import { RepositoryError } from '../../repositories/errors'
import type { AttachmentDataRepository, NotesDataRepository } from '../../repositories/types'
import type { Folder, Subtask, Task } from '../../types'
import { collectFolderSubtreeIds } from '../../lib/folders'
import { collectTaskIdsInFolders } from '../../lib/tasks'
import { collectSubtaskSubtreeIds } from '../../lib/subtasks'
import { chunkIds } from './deleteCopy'

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
    await Promise.resolve(this.notes.deleteFolder(folderId))
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
    await Promise.resolve(this.notes.deleteTask(taskId))
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
    await Promise.resolve(this.notes.deleteSubtask(subtaskId))
    return ids
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
