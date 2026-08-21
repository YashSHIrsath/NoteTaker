import type { Folder, Subtask, Task } from '../../types'
import { collectFolderSubtreeIds } from '../../lib/folders'
import { collectTaskIdsInFolders } from '../../lib/tasks'
import { collectSubtaskSubtreeIds } from '../../lib/subtasks'

export function folderDeleteCopy(folder: Folder, folders: Folder[], tasks: Task[]): {
  title: string
  description: string
  folderIds: string[]
  taskIds: string[]
} {
  const folderIds = collectFolderSubtreeIds(folders, folder.id)
  const taskIds = collectTaskIdsInFolders(tasks, folderIds)
  const nestedFolderCount = folderIds.length - 1
  const isEmpty = nestedFolderCount === 0 && taskIds.length === 0
  const title = `Delete "${folder.name}"?`
  if (isEmpty) {
    return {
      title,
      description: 'This folder is empty. It will be permanently deleted.',
      folderIds,
      taskIds,
    }
  }
  return {
    title,
    description:
      'This will permanently delete:\n- this folder\n- nested folders\n- tasks\n- subtasks\n- attachments',
    folderIds,
    taskIds,
  }
}

export function taskDeleteCopy(task: Task): { title: string; description: string } {
  return {
    title: `Delete "${task.title.trim() || 'Untitled'}"?`,
    description: 'This will permanently delete this note, its subtasks and attachments.',
  }
}

export function subtaskDeleteCopy(subtask: Subtask, subtasks: Subtask[]): {
  title: string
  description: string
  ids: string[]
} {
  const ids = collectSubtaskSubtreeIds(subtasks, subtask.id)
  const childTitles = subtasks
    .filter((item) => item.id !== subtask.id && ids.includes(item.id))
    .map((item) => item.title.trim() || 'Untitled')
  const title = `Delete "${subtask.title.trim() || 'Untitled'}"?`
  if (childTitles.length === 0) {
    return {
      title,
      description: 'This subtask will be permanently deleted.',
      ids,
    }
  }
  const listed = childTitles.slice(0, 8).map((name) => `- ${name}`).join('\n')
  const extra = childTitles.length > 8 ? `\n- and ${childTitles.length - 8} more` : ''
  return {
    title,
    description: `This will also delete:\n${listed}${extra}`,
    ids,
  }
}

export function attachmentDeleteCopy(name: string): { title: string; description: string } {
  return {
    title: `Delete "${name}"?`,
    description: 'This will permanently delete the file.',
  }
}

export function chunkIds(ids: string[], size = 50): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size))
  }
  return chunks
}
