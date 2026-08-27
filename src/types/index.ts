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

/**
 * What a note *is*, chosen explicitly rather than inferred.
 *
 * A due date used to be the only thing that made something a task, which meant the two ideas
 * couldn't be separated: you couldn't put a reminder on a note without it growing a deadline, and
 * you couldn't say "this is a task" before you knew when it was due. The switch in the note header
 * writes this; nothing else does.
 */
export type NoteKind = 'note' | 'due_task'

/**
 * Where a due-date task sits in its life, derived — never stored, never picked.
 *
 * The four task states are a function of `completed`, `completedAt`, `dueAt` and the time right
 * now, which is why there is no setter for them anywhere in the app. `public.task_lifecycle` in
 * the database is the same ladder in SQL; lib/taskLifecycle.ts is the copy the UI reads, and the
 * two are kept deliberately identical.
 */
export type TaskLifecycle =
  | 'note'
  | 'upcoming'
  | 'completed_on_time'
  | 'overdue'
  | 'completed_late'

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
  /** Plain note or deadline-tracked task. Only the mode switch changes this. */
  noteKind: NoteKind
  /** ISO timestamp. Always null on a plain note; the database enforces that too. */
  dueAt: string | null
  /** Ticked or not. The one piece of the lifecycle a person sets directly. */
  completed: boolean
  /**
   * ISO timestamp of the tick, written by the server and read-only here.
   *
   * This is what separates "finished before the deadline" from "finished two hours after it", so
   * it can't come from the browser — the database stamps it from its own clock (see
   * normalize_task_schedule) and ignores whatever is sent. Null whenever `completed` is false.
   */
  completedAt: string | null
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
 * How a reminder decides when to fire.
 *
 * `relative` is the only one that needs the task to have a due date — it is an offset from it, so
 * it disarms on its own if the deadline is removed and re-arms if a new one is set. The other two
 * stand on their own and work just as well on a plain note.
 */
export type ReminderKind = 'one_time' | 'recurring' | 'relative'

/** How often a repeating reminder comes back. Every N of these. */
export type RecurUnit = 'day' | 'week'

/** Which side of the deadline a relative reminder sits on. */
export type OffsetDirection = 'before' | 'after'

/**
 * One reminder on one task. A task can have any number of them, firing independently.
 *
 * The fields come in three sets, one per `kind`, and only that kind's set is populated — the
 * database has a CHECK that says so, because a row claiming to be weekly while holding an absolute
 * instant would fire on whichever branch the scheduler happened to read first.
 *
 * `nextRunAt` and `lastRunAt` are written by the server and are read-only here. So is the
 * scheduling itself: nothing in this app works out when the next Monday is — `reminder_next_run`
 * does, next to the clock and the stored timezone, so it keeps happening with every browser shut.
 */
export interface Reminder {
  id: string
  taskId: string
  kind: ReminderKind
  /** What the email says. Null means the sender writes a sensible sentence from the schedule. */
  message: string | null
  /** The user's own on/off switch. Independent of whether anything is still scheduled. */
  isActive: boolean
  /** IANA zone the wall-clock fields below are read in — stored per reminder, so "9:00" keeps
   *  meaning 9:00 where you set it after you travel or after the clocks change. */
  timezone: string

  /** kind === 'one_time': the exact instant, as an ISO timestamp. */
  atUtc: string | null

  /** kind === 'recurring': every `recurInterval` × `recurUnit`, at `recurTime`. */
  recurUnit: RecurUnit | null
  recurInterval: number | null
  /** 0 = Sunday, matching both `Date.getDay()` and Postgres `dow`. Weekly only. */
  recurWeekday: number | null
  /** Local wall-clock time as `HH:MM`. */
  recurTime: string | null
  /** The occurrence the series counts from, so "every 2 days" lands on defined days instead of
   *  drifting with whenever it last ran. `YYYY-MM-DD`. */
  anchorDate: string | null

  /** kind === 'relative': this many minutes before or after the task's due date. */
  offsetMinutes: number | null
  offsetDirection: OffsetDirection | null

  /** Server-computed. Null means nothing is scheduled — a one-time reminder that has fired, or a
   *  relative one whose task has no deadline right now. */
  nextRunAt: string | null
  lastRunAt: string | null
}

/** A reminder being created or edited: everything the user chooses, and nothing the server owns. */
export type ReminderDraft = Pick<
  Reminder,
  | 'kind'
  | 'message'
  | 'isActive'
  | 'timezone'
  | 'atUtc'
  | 'recurUnit'
  | 'recurInterval'
  | 'recurWeekday'
  | 'recurTime'
  | 'anchorDate'
  | 'offsetMinutes'
  | 'offsetDirection'
>

/**
 * Something that happened to a task's schedule.
 *
 * Append-only and written entirely by database triggers — see the task_events migration. It exists
 * because a column only ever holds the present: "when was this due before you moved it", "did that
 * reminder actually go out", "when did you tick this off" are all questions about the past, and
 * none of them could be answered from the task row.
 */
export type TaskEventKind =
  | 'due_set'
  | 'due_changed'
  | 'due_cleared'
  | 'reminder_added'
  | 'reminder_fired'
  | 'reminder_removed'
  | 'completed'
  | 'reopened'

export interface TaskEvent {
  id: string
  taskId: string
  kind: TaskEventKind
  /** When it happened, per the server's clock. */
  occurredAt: string
  /** The deadline as it was, for a due-date change. */
  previousAt: string | null
  /** The deadline as it became — or, for a fired reminder, when it next runs. */
  nextAt: string | null
  /** The reminder's schedule in words, kept here so history still reads correctly once the
   *  reminder itself has been deleted. */
  detail: string | null
  reminderId: string | null
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


