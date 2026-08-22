import { getFolderPath } from '../../lib/folders'
import { getTaskById } from '../../lib/tasks'
import type { Folder, Subtask, Task } from '../../types'

export type SearchResultKind = 'folder' | 'task' | 'subtask'

export interface SearchResult {
  id: string
  kind: SearchResultKind
  title: string
  pathLabel: string
  href: string
  /** Set for 'task'/'subtask' results so the picker can open the task's popup instead of navigating away. */
  taskId?: string
  revealSubtaskId?: string
}

export interface SearchNotesInput {
  folders: Folder[]
  tasks: Task[]
  subtasks: Subtask[]
}

const MAX_RESULTS = 50

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase()
}

export function textMatches(haystack: string, needle: string): boolean {
  if (!needle) {
    return false
  }
  return haystack.toLowerCase().includes(needle)
}

function folderPathLabel(folders: Folder[], folderId: string, includeSelf: boolean): string {
  const path = getFolderPath(folders, folderId)
  const names = (includeSelf ? path : path.slice(0, -1)).map((folder) => folder.name)
  return names.join(' → ')
}

export function searchNotes(query: string, data: SearchNotesInput): SearchResult[] {
  const needle = normalizeSearchQuery(query)
  if (!needle) {
    return []
  }

  const results: SearchResult[] = []

  for (const folder of data.folders) {
    if (!textMatches(folder.name, needle)) {
      continue
    }
    results.push({
      id: folder.id,
      kind: 'folder',
      title: folder.name.trim() || 'Untitled',
      pathLabel: folderPathLabel(data.folders, folder.id, false),
      href: `/folder/${folder.id}`,
    })
    if (results.length >= MAX_RESULTS) {
      return results
    }
  }

  for (const task of data.tasks) {
    if (!textMatches(task.title, needle) && !textMatches(task.content, needle)) {
      continue
    }
    results.push({
      id: task.id,
      kind: 'task',
      title: task.title.trim() || 'Untitled',
      pathLabel: folderPathLabel(data.folders, task.folderId, true),
      href: `/folder/${task.folderId}`,
      taskId: task.id,
    })
    if (results.length >= MAX_RESULTS) {
      return results
    }
  }

  for (const subtask of data.subtasks) {
    if (!textMatches(subtask.title, needle)) {
      continue
    }
    const task = getTaskById(data.tasks, subtask.taskId)
    results.push({
      id: subtask.id,
      kind: 'subtask',
      title: subtask.title.trim() || 'Untitled',
      pathLabel: task?.title.trim() || 'Untitled',
      href: task ? `/folder/${task.folderId}` : `/task/${subtask.taskId}`,
      taskId: task ? subtask.taskId : undefined,
      revealSubtaskId: subtask.id,
    })
    if (results.length >= MAX_RESULTS) {
      return results
    }
  }

  return results
}
