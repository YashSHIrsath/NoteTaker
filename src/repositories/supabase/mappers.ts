import { NOTES_STORAGE_VERSION } from '../../services/storage/types'
import type { Attachment, AttachmentType, Folder, Subtask, Task, TaskStatus } from '../../types'
import { isTaskColor } from '../../lib/taskColor'
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
  sort_order: number
  due_at: string | null
  remind_before_minutes: number | null
  status: string | null
  tags: string[]
  color: string | null
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

export function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    content: row.content,
    isImportant: row.is_important,
    isPinned: row.is_pinned,
    sortOrder: row.sort_order,
    dueAt: row.due_at,
    remindBeforeMinutes: row.remind_before_minutes,
    status: isTaskStatus(row.status) ? row.status : null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    color: isTaskColor(row.color) ? row.color : null,
  }
}

export function taskToRow(task: Task): TaskRow {
  return {
    id: task.id,
    folder_id: task.folderId,
    title: task.title,
    content: task.content,
    is_important: task.isImportant,
    is_pinned: task.isPinned,
    sort_order: task.sortOrder,
    due_at: task.dueAt,
    remind_before_minutes: task.remindBeforeMinutes,
    status: task.status,
    tags: task.tags,
    color: task.color,
  }
}

function isTaskStatus(value: string | null): value is TaskStatus {
  return value === 'pending' || value === 'ongoing' || value === 'complete'
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

export function snapshotFromRows(
  folderRows: FolderRow[],
  taskRows: TaskRow[],
  subtaskRows: SubtaskRow[],
  uiState: UiState,
): AppSnapshot {
  return {
    version: NOTES_STORAGE_VERSION,
    folders: folderRows.map(folderFromRow),
    tasks: taskRows.map(taskFromRow),
    subtasks: subtaskRows.map(subtaskFromRow),
    uiState,
  }
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
