/** A container in the folder tree. Tasks are never folders. */
export interface Folder {
  id: string
  name: string
  parentId: string | null
  isImportant: boolean
  sortOrder: number
  /**
   * How far this folder should reach, chosen while creating it. See ContentVisibility.
   *
   * A creation hint and nothing more: set once, on the way in, and never populated on the way back
   * out. Where an existing item stands is read from the sharing index (see SharingIndex), which is
   * the one source of truth for it — a field that was both written here and filled in on read would
   * be a second one, and the two would eventually disagree.
   *
   * It exists so that "new private folder" is a single atomic write. Creating the folder and then
   * changing its visibility would work, but it would leave a window — one request wide, and long
   * enough for another member's poll — in which a folder meant to be private was visible to the whole
   * space. Undefined means Everyone, which is the column's own default and the state of every folder
   * that existed before this feature.
   */
  visibility?: ContentVisibility
}

export interface FolderNode extends Folder {
  children: FolderNode[]
}

export type SidebarNavId = 'tree' | 'mynotes' | 'tasks' | 'important' | 'spaces'

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
export type TaskListScope = 'folder' | 'tasks' | 'important'

/** The grid's name for the same three listings. Card size, card order and pinning are all
 *  per-listing for the same reason, so they share one set of scopes. */
export type TaskGridScope = TaskListScope

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
   *  follow behind, in flow order — see inDisplayOrder. */
  order?: number
  /**
   * The folder `order` was minted in. Only ever set for the `folder` scope, and only meaningful
   * there.
   *
   * All folder views share one scope, which is right for size — a card is one card and keeps the
   * size it was given — and wrong for order, because an order only means anything relative to
   * siblings. Without this, a note moved to another folder arrived holding a position minted among
   * notes it no longer sits beside, colliding with whatever was already there.
   *
   * Absent means "wherever this note is now", which is how every order written before this was
   * already being read. So nothing resets on the first load; an order only stops applying once the
   * note actually moves.
   */
  orderFolderId?: string
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
  /**
   * The listings this note is pinned to the top of.
   *
   * Per-listing rather than a single flag, for the same reason card size is (see TaskListScope):
   * a note sits among different neighbours in its folder, in Tasks and in Starred, so "keep this
   * one first" is a different answer in each. Empty means pinned nowhere.
   */
  pinnedScopes: TaskListScope[]
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
  /** How far this note should reach, chosen while creating it. A write-only creation hint, exactly
   *  as on Folder — see the note there for why it is not filled in on read. */
  visibility?: ContentVisibility
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

/**
 * `'file'` is the catch-all: anything that isn't an image, PDF, or one of the specifically
 * previewed document formats still uploads and attaches — just as a name+icon chip with no
 * content preview, rather than being rejected outright. See classifyAttachmentFile.
 */
export type AttachmentType = 'image' | 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'csv' | 'md' | 'txt' | 'file'

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



/* ------------------------------------------------------------------ shared spaces
 *
 * A space is a workspace several people hold together. Nothing here describes its *contents* —
 * folders, tasks and subtasks in a space are the same types as anywhere else, which is the whole
 * reason the app renders one without a parallel component tree (see WorkspaceRef).
 */

/**
 * What someone may do in a space.
 *
 * Four rather than two. The split between owner and admin is what lets a space have several people
 * who can manage members without any ambiguity about who may delete it; `viewer` is what lets a plan
 * be shown to someone without hoping they don't touch it. Enforced in the database — see
 * space_can_write and the *_writable_by_uid helpers — not here.
 */
export type SpaceRole = 'owner' | 'admin' | 'editor' | 'viewer'

/** Exactly one per space, and the only role an invitation can never hand out. */
export const SPACE_ROLES: SpaceRole[] = ['owner', 'admin', 'editor', 'viewer']

/** The roles a person can actually be invited as. */
export const INVITABLE_ROLES: SpaceRole[] = ['admin', 'editor', 'viewer']

export interface Space {
  id: string
  name: string
  /** What the space is for, in the members' own words. The first question a new member has. */
  description: string | null
  /** The space's own picture. Null falls back to its colour, which is what every space starts with. */
  imageUrl: string | null
  /** A palette name (see TaskPaletteColor), or null for the app's own accent. Carried through the
   *  whole shell while you're inside the space, so "which workspace am I in" is never a guess. */
  color: TaskPaletteColor | null
  createdBy: string
  createdAt: string
}

/** A space plus where the signed-in account stands in it — what the Shared Spaces page lists. */
export interface SpaceSummary extends Space {
  role: SpaceRole
  memberCount: number
  /**
   * Display settings that belong to the space rather than to a person, and null until somebody sets
   * them — in which case each member's own preference applies.
   *
   * The tab order and the note style describe the space: everyone in it is looking at the same tree,
   * so one member arranging it arranges it for the others. Tiles per row is *not* here on purpose —
   * it is a function of the screen in front of you, and is already stored per screen size for that
   * reason. Which page you open on stays personal too: that is about where you start, not about the
   * space.
   */
  navOrder: string[] | null
  viewStyle: 'professional' | 'clipboard' | null
}

export interface SpaceMember {
  userId: string
  role: SpaceRole
  joinedAt: string
  email: string
  fullName: string | null
  avatarUrl: string | null
}

/* ------------------------------------------------------------------ per-item privacy
 *
 * How far an item reaches inside the space that holds it. Three levels, and the names are the
 * database's own (see the content_privacy migration) rather than the ones on screen: 🔒 Only me,
 * 👥 Selected people and 🌐 Everyone are what a person picks, and lib/contentPrivacy.ts is where the
 * two vocabularies meet.
 *
 * Only ever advisory here. Every one of these values is enforced by RLS on the way out of the
 * database, so the app is showing a decision that has already been made rather than making one —
 * which is why nothing in this app decides who may read a row.
 */
export type ContentVisibility = 'private' | 'restricted' | 'space'

/** The two kinds of thing that can carry a visibility of their own. */
export type ShareableEntity = 'folder' | 'task'

/**
 * What one item's sharing looks like, as the person looking at it is allowed to know.
 *
 * `sharedWith` is only ever populated for an item the reader can reach — content_shares has its own
 * RLS policy saying exactly that — so an empty list means "nobody, or none of your business", and the
 * UI never has to tell those apart.
 */
export interface ContentSharing {
  entityType: ShareableEntity
  entityId: string
  visibility: ContentVisibility
  /** Who made it. Keeps access no matter what happens to `sharedWith` — see the migration's note on
   *  why the owner is deliberately not a row in the share table. */
  ownerId: string | null
  /** Whether the signed-in account may change any of this. The owner, and nobody else. */
  canManage: boolean
  /** Ids of the space members this item is explicitly shared with. Meaningful only when
   *  `visibility` is 'restricted'; empty at the other two levels, where it is also cleared in the
   *  database so no grant ever sits behind a level that ignores it. */
  sharedWith: string[]
}

/**
 * What widening a folder's visibility would actually reveal.
 *
 * Read before the change, so the dialog can say "12 notes inside will become visible" instead of
 * finding out afterwards. Counts and not titles, deliberately: it exists to inform the owner, and a
 * list of names would be a second way to read things.
 */
export interface FolderVisibilityImpact {
  /** Folders below this one carrying no restriction of their own — they reach exactly as far as it
   *  does, so they move with it. */
  openFolders: number
  openTasks: number
  /** Items below this one that will stay exactly as private as they are, whatever happens here.
   *  The reassuring half of the sentence. */
  keptPrivate: number
}

/**
 * Which classes of message somebody wants from one space.
 *
 * Never a way to receive more than access allows: the database checks access first and consults
 * these second, so turning everything on cannot surface an item you cannot see. Only ever a way to
 * receive less.
 */
export interface SpaceNotificationPrefs {
  spaceId: string
  /** Reminders somebody set on a note. On by default. */
  reminders: boolean
  /** A deadline arriving, and a task being completed. On by default. */
  dueDates: boolean
  /** Somebody edited something. Off by default — the class that becomes a firehose. */
  contentUpdates: boolean
}

export type SpaceInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked'

/**
 * An invitation, addressed to an email rather than to an account.
 *
 * That is the point: requiring the invitee to already be a user means every invitation starts with
 * "sign up first, then tell me". This one waits, and appears in the app the moment an account with
 * that address exists — nothing is claimed or migrated at signup.
 */
export interface SpaceInvite {
  id: string
  spaceId: string
  email: string
  role: SpaceRole
  /** The credential in an invite link. Present for the space's own members (who build the link) and
   *  for the invitee (who is already holding it if they followed one). */
  token: string
  status: SpaceInviteStatus
  createdAt: string
  expiresAt: string
}

/** A pending invitation as the person invited sees it, with the parts they cannot read themselves. */
export interface IncomingSpaceInvite {
  id: string
  spaceId: string
  spaceName: string
  spaceColor: TaskPaletteColor | null
  role: SpaceRole
  token: string
  createdAt: string
  expiresAt: string
  invitedByName: string | null
  invitedByEmail: string
}

/* ------------------------------------------------------------------ space activity
 *
 * What happened in a shared space. Written entirely by database triggers reading OLD and NEW — see
 * the space_activity migration — so nothing in this app authors one, and there is no setter for any
 * of it anywhere.
 */

/**
 * What happened, derived from the diff rather than declared.
 *
 * The trigger works this out by comparing the row before and after, which is why it cannot be wrong
 * about it: a moved note is a note whose folder_id changed, whatever anyone says they were doing.
 * Where several fields changed at once, the most consequential one names the entry.
 */
export type SpaceActivityAction =
  | 'created'
  | 'deleted'
  | 'renamed'
  | 'moved'
  | 'completed'
  | 'reopened'
  | 'due_changed'
  | 'content_edited'
  | 'starred'
  | 'unstarred'
  | 'attachment_added'
  | 'attachment_removed'
  | 'updated'

export type SpaceActivityEntity = 'folder' | 'task' | 'subtask' | 'attachment'

export interface SpaceActivityEntry {
  /** Ordered and paged by this. A feed's cursor, not a random identifier. */
  id: number
  occurredAt: string
  action: SpaceActivityAction
  entityType: SpaceActivityEntity
  entityId: string
  /**
   * The title as it was when this happened, stored rather than joined.
   *
   * This is what keeps a line readable after the thing it describes has been deleted — the same
   * reason task_events keeps a reminder's description. A join would render "deleted" entries blank,
   * which are precisely the ones anybody goes looking for.
   */
  entityTitle: string | null
  /** Where it was, in words, at the time. Also a snapshot for the same reason. */
  pathLabel: string | null
  /** The sentence the write path declared. Null for a change that did not come through it. */
  intent: string | null
  /**
   * The row before and after, as the database saw it.
   *
   * A note's body is left out of an update's diff and kept on a delete: storing two copies of every
   * body on every save would make the log larger than the notes, and a delete is the one case where
   * the body is not still in the live row.
   */
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
  actorAvatarUrl: string | null
}
