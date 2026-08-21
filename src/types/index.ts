/** A container in the folder tree. Tasks are never folders. */
export interface Folder {
  id: string
  name: string
  parentId: string | null
  isImportant: boolean
  sortOrder: number
}

export interface FolderNode extends Folder {
  children: FolderNode[]
}

export type SidebarNavId = 'tree' | 'mynotes' | 'important'

/**
 * A note/workspace that belongs to a folder via folderId.
 * It is not a folder, has no child folders, and is not a navigation container.
 */
export interface Task {
  id: string
  title: string
  /** Parent folder that contains this task. */
  folderId: string
  content: string
  isImportant: boolean
  sortOrder: number
}

/**
 * Nested checklist item that belongs to a Task.
 * Never a folder. parentSubtaskId is null for a direct child of the Task.
 */
export interface Subtask {
  id: string
  title: string
  taskId: string
  parentSubtaskId: string | null
  completed: boolean
}

export type AttachmentType = 'image' | 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'csv'

/**
 * File attached to a Task. Not a folder or subtask.
 * Preview URLs are session-only and are not part of persisted app JSON.
 */
export interface Attachment {
  id: string
  taskId: string
  type: AttachmentType
  name: string
  mimeType: string
  isImage: boolean
  isPdf: boolean
  isDocument: boolean
  /** Temporary in-memory object URL for the current session. */
  previewUrl: string
}


