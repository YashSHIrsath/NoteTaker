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

export type SidebarNavId = 'tree' | 'mynotes' | 'tasks' | 'important'

/** Only meaningful once a task has a due date — plain notes stay null. */
export type TaskStatus = 'pending' | 'ongoing' | 'complete'

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
  /** Pinned tasks surface in a dedicated section at the top of their folder's task list. */
  isPinned: boolean
  sortOrder: number
  /** ISO timestamp. Null when the task has no due date. */
  dueAt: string | null
  /** Minutes before dueAt to send the reminder email. Null means "at the due time". */
  remindBeforeMinutes: number | null
  /** Null whenever dueAt is null — status tracking is opt-in via setting a due date. */
  status: TaskStatus | null
  /** Free-text labels, independent of folder location. */
  tags: string[]
  /**
   * Chosen card color: either a palette name (see TaskPaletteColor) or a `#rrggbb` value from the
   * custom picker. Null means "decide for me" — the view's own rule then applies, which is the
   * folder's color in a folder and a stable scattered color in the flat lists.
   */
  color: TaskColor | null
}

/** The named task palette; each name carries proper light and dark values (see the --task-*
 *  tokens), which a raw hex can't. TASK_PALETTE in lib/taskColor.ts is checked against this, so
 *  the two can't drift. The first five double as the folder categories, which is why a color
 *  stored before the palette grew still resolves. */
export type TaskPaletteColor =
  | 'indigo'
  | 'teal'
  | 'amber'
  | 'rose'
  | 'emerald'
  | 'violet'
  | 'blue'
  | 'cyan'
  | 'lime'
  | 'orange'
  | 'pink'
  | 'slate'

/** A palette name, or a custom `#rrggbb` from the picker. */
export type TaskColor = TaskPaletteColor | string

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


