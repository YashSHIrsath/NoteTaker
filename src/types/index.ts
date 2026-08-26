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
/** A card's place on the resizable grid: column, row, and size in grid units. */
export interface TaskGridLayout {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Which listing an arrangement belongs to.
 *
 * A task appears in three different places — inside its folder, in the flat Tasks list, and in
 * Starred — and each of them is a different set of cards next to different neighbours. One
 * arrangement shared between them meant sizing a card in a folder resized the same card in the
 * other two, which is not a card being remembered so much as three views fighting over one
 * setting. Every listing now keeps its own.
 *
 * All folder views share the 'folder' scope deliberately: a card is one card in its folder, and
 * that folder is the only listing it appears in under this scope.
 */
export type TaskGridScope = 'folder' | 'tasks' | 'important'

/**
 * What one listing remembers about one card.
 *
 * Every field is optional, and that is the point: a card that was dragged but never resized
 * stores an `order` and no size, so its width still follows the "cards per row" setting the way an
 * untouched card's does. Writing a derived width back as though it had been chosen is what would
 * strand a card at its old size the next time that setting changed.
 */
export interface TaskGridPlacement {
  /**
   * Which column count `w` is measured in — see PLACEMENT_VERSION in lib/taskGrid. Absent means
   * the original 24-column canvas, and is converted on read. Stamped on every write.
   */
  v?: number
  /** Width in grid columns, if this card has been resized in this listing. */
  w?: number
  /** Height in grid rows, if this card has been resized in this listing. */
  h?: number
  /** Where this card sits in the listing's order, if it has been dragged. Cards without one
   *  follow behind, in the order the listing hands them over. */
  order?: number
}

/** Every arrangement a task has, by the listing it was arranged in. Absent scopes fall back to
 *  flow order at the default size, the same as a card that has never been touched. */
export type TaskGridLayouts = Partial<Record<TaskGridScope, TaskGridPlacement>>

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
  /**
   * Saved size and place on the resizable grid, per listing the card appears in (see
   * TaskGridScope). Null, or a missing scope, until the card is actually dragged or resized there
   * — an unplaced card falls back to flow order (sortOrder) at the default size, which is also
   * what every card looked like before the grid existed.
   */
  gridLayouts: TaskGridLayouts | null
  /** ISO timestamp. Null when the task has no due date. */
  dueAt: string | null
  /** Minutes before dueAt to send the reminder email. Null means "at the due time". */
  remindBeforeMinutes: number | null
  /** Null whenever dueAt is null — status tracking is opt-in via setting a due date. */
  status: TaskStatus | null
  /** Names of the tags on this task, resolved from the tag catalogue (see Tag). Independent of
   *  folder location. */
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
 * A label you own, not a string you typed into one task.
 *
 * Tags used to live only as free text inside each task's own array, which meant "Job" on forty
 * tasks was forty unrelated strings: no way to offer the ones you already have, a typo made a
 * second tag indistinguishable from a mistake, and renaming meant editing every task. A tag is
 * made once here and attached wherever it belongs (see the task_tags join in the schema).
 *
 * Tasks still carry tag *names* rather than ids — every list, filter and pill in the app reads
 * them as names, and the repository resolves the two at the boundary. The catalogue is what makes
 * a tag reusable; the names are what make it legible.
 */
export interface Tag {
  id: string
  name: string
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


