import type {
  Attachment,
  ContentSharing,
  ContentVisibility,
  FolderVisibilityImpact,
  IncomingSpaceInvite,
  Reminder,
  ReminderDraft,
  SpaceActivityAction,
  SpaceActivityEntity,
  SpaceActivityEntry,
  SpaceInvite,
  SpaceMember,
  SpaceNotificationPrefs,
  SpaceRole,
  SpaceSummary,
  ShareableEntity,
  TaskEvent,
} from '../types'
import type { AppSnapshot, UiState } from '../services/storage'
import type { NotesOp } from '../services/notes/ops'

export type { AppSnapshot, UiState }

export type MaybePromise<T> = T | Promise<T>

/**
 * Persisted notes document (folders, tasks, subtasks, tags).
 * LocalStorage is synchronous; Supabase is asynchronous. FolderContext treats both as MaybePromise.
 *
 * Read as a whole document, written as named changes. The asymmetry is deliberate: opening the app
 * needs everything, and there is no cheaper way to get it, but a write that sends everything is a
 * write that has an opinion about rows it never loaded. `save(snapshot)` used to be the only way in,
 * and it ended by deleting every row the snapshot didn't mention — see NotesOp for what that cost.
 *
 * Deletes are ops rather than methods of their own, so this interface has exactly one entry point
 * for changing anything. There is nowhere else for a permission check, a lock or an audit entry to
 * have to be remembered.
 */
export interface NotesDataRepository {
  load(): MaybePromise<AppSnapshot>
  /**
   * Applies a batch and resolves only when all of it landed.
   *
   * Rejects with a RepositoryError if any part failed, including a delete that matched no row —
   * callers rely on that to tell "gone" from "never there". Nothing is guaranteed about how much of
   * a rejected batch was written; the caller rolls back the rows it named (see rollbackOps).
   *
   * `intent` is a short sentence describing what the person was doing — "Moved a note", "Marked a
   * note done". It is decoration on top of the record, never the record itself: in a shared space
   * the database's own triggers write what actually changed from OLD and NEW, and this only decides
   * how the line reads. A batch with no intent is still fully recorded. Ignored for personal notes,
   * which have nothing to attribute.
   */
  apply(ops: NotesOp[], intent?: string): MaybePromise<void>
}

/** Files attached to a task. LocalStorage implementation is in-memory; Supabase uses Storage + metadata. */
export interface AttachmentDataRepository {
  createAttachment(taskId: string, file: File): MaybePromise<Attachment>
  getFile(id: string): MaybePromise<File | null>
  getPreviewUrl(id: string): MaybePromise<string | null>
  deleteAttachment(id: string): MaybePromise<void>
  listAttachments(): MaybePromise<Attachment[]>
  listStoragePathsForTaskIds(taskIds: string[]): MaybePromise<string[]>
  removeStoragePaths(paths: string[]): MaybePromise<void>
  clearCache(): void
}

/**
 * Reminders, as ordinary per-row CRUD rather than part of the notes document.
 *
 * Deliberately not folded into NotesDataRepository: that one round-trips the whole snapshot and
 * deletes anything the snapshot doesn't mention, which would wipe a reminder added in another tab
 * and stamp over the `next_run_at` the scheduler wrote. Reminders are server-owned enough that
 * they need their own boundary.
 */
export interface RemindersDataRepository {
  /** Every reminder the signed-in account owns; the UI groups them by task itself. */
  listAll(): MaybePromise<Reminder[]>
  create(taskId: string, draft: ReminderDraft): MaybePromise<Reminder>
  remove(reminderId: string): MaybePromise<void>
  /** One task's history, newest first. Read on demand rather than with the notes document: it is
   *  only ever looked at for the note whose panel is open, and it grows without bound. */
  listEvents(taskId: string): MaybePromise<TaskEvent[]>
}

/**
 * Spaces, membership and invitations.
 *
 * Separate from the notes document on purpose: a space is not content, it is who may reach content.
 * Nothing here round-trips through the op queue — these are discrete acts with their own answers
 * ("that person is already in this space", "this space has reached its limit"), and each needs to
 * report back rather than be folded into a batch.
 */
export interface SpacesDataRepository {
  /** Every space this account is in, with its own role and head count. */
  listSpaces(): Promise<SpaceSummary[]>
  /** Invitations addressed to this account, carrying the space name it cannot read itself. */
  listIncomingInvites(): Promise<IncomingSpaceInvite[]>
  /** Invitations still outstanding for one space, for whoever manages it. */
  listPendingInvites(spaceId: string): Promise<SpaceInvite[]>
  listMembers(spaceId: string): Promise<SpaceMember[]>
  createSpace(name: string, color: string | null): Promise<SpaceSummary>
  invite(spaceId: string, email: string, role: SpaceRole): Promise<SpaceInvite>
  /** Resolves to the space's id, so the caller can walk straight into it. */
  respondToInvite(args: { accept: boolean; inviteId?: string; token?: string }): Promise<string>
  setMemberRole(spaceId: string, userId: string, role: SpaceRole): Promise<void>
  /** Removing someone, or leaving yourself. The owner cannot be removed either way. */
  removeMember(spaceId: string, userId: string): Promise<void>
  revokeInvite(inviteId: string): Promise<void>
  transferOwnership(spaceId: string, toUserId: string): Promise<void>
  /** The space's own identity — admin only. Null clears a field; omitting it leaves it alone. */
  setProfile(
    spaceId: string,
    profile: {
      name?: string
      description?: string | null
      color?: string | null
      imageUrl?: string | null
    },
  ): Promise<SpaceSummary>
  /** The display settings the whole space shares. Null clears one back to personal preference. */
  setDisplaySettings(
    spaceId: string,
    settings: { navOrder?: string[] | null; viewStyle?: string | null },
  ): Promise<SpaceSummary>
  /**
   * What has happened in a space, newest first.
   *
   * `beforeId` pages backwards from an entry already on screen. A cursor rather than an offset
   * because the feed grows at the end being read from — an offset would skip or repeat rows as new
   * activity arrives underneath the reader.
   */
  listActivity(
    spaceId: string,
    options?: {
      beforeId?: number
      limit?: number
      /** Only these people's actions. Empty or absent means everyone's. */
      actorIds?: string[]
      /** Only these kinds of change. Empty or absent means every kind. */
      actions?: SpaceActivityAction[]
    },
  ): Promise<SpaceActivityEntry[]>
  /**
   * Email the invited address, and email the inviter back when it is answered.
   *
   * Separate calls rather than something invite_to_space and respond_to_space_invite do themselves,
   * because sending mail is not a database transaction: a mailbox being down must not roll back an
   * invitation that was correctly created, and a link that works is still a way in. So both resolve
   * to whether the message went, and neither throws — the caller decides what to say about a
   * failure, which for an invitation is "share this link instead".
   */
  notifyInvited(inviteId: string): Promise<boolean>
  notifyAnswered(args: { inviteId?: string; token?: string }): Promise<boolean>
  /** One item's own history — the note in front of you rather than the whole space. */
  listEntityHistory(entityType: SpaceActivityEntity, entityId: string): Promise<SpaceActivityEntry[]>

  /* ---------------------------------------------------------------- per-item privacy
   *
   * Sharing lives here rather than on the notes repository for the same reason membership does: it
   * is not content, it is who may reach content. Folding it into the op queue would also be wrong in
   * a way that matters — an op batch is fire-and-forget and rolls back locally on failure, and
   * "share this with Rahul" is a discrete act with an answer ("only the owner can change this") that
   * has to reach the person who asked.
   */

  /**
   * One item's sharing state, read fresh.
   *
   * Resolves to null for an item the caller cannot reach — the database returns no row rather than
   * refusing, which is what stops this being a way to test ids for existence. The share sheet reads
   * this on open rather than trusting the loaded snapshot, because somebody else may have changed
   * the audience since the workspace was read.
   */
  getSharing(entityType: ShareableEntity, entityId: string): Promise<ContentSharing | null>

  /**
   * Sets who can see an item, and with it who its reminders reach.
   *
   * `userIds` is only consulted for 'restricted', and the server has the final say on all of it: it
   * drops anybody who is not a member of the item's space, never removes the owner, and turns
   * 'restricted' with nobody left into 'private' rather than storing a sharing state that means
   * nothing. So the resolved value is the truth, and it is what the caller should keep — not the
   * arguments it sent.
   */
  setVisibility(
    entityType: ShareableEntity,
    entityId: string,
    visibility: ContentVisibility,
    userIds: string[],
  ): Promise<ContentSharing>

  /** What opening a folder up would actually reveal, asked before the change so the dialog can say
   *  so. Counts only — see FolderVisibilityImpact. */
  folderVisibilityImpact(folderId: string): Promise<FolderVisibilityImpact>

  /** Which classes of message this account wants from one space. Always resolves — a member who has
   *  never chosen gets the defaults rather than nothing. */
  getNotificationPrefs(spaceId: string): Promise<SpaceNotificationPrefs>
  /** Omitted switches are left as they are, so one toggle does not have to send the others. */
  setNotificationPrefs(
    spaceId: string,
    changes: { reminders?: boolean; dueDates?: boolean; contentUpdates?: boolean },
  ): Promise<SpaceNotificationPrefs>
}

export interface AppRepositories {
  notes: NotesDataRepository
  attachments: AttachmentDataRepository
  reminders: RemindersDataRepository
}
