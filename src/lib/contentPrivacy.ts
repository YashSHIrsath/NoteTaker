import type {
  ContentSharing,
  ContentVisibility,
  Folder,
  ShareableEntity,
  SpaceMember,
} from '../types'

/**
 * The app's side of per-item privacy.
 *
 * Everything here is for *showing* a decision, never for making one. Access is settled by RLS before
 * a row ever reaches this process — an item you cannot see is not in the array these functions read —
 * so nothing in this file is load-bearing for security, and none of it is a second implementation of
 * the rule. What it does is answer the two questions the interface has to answer: which badge goes on
 * this row, and what sentence describes who can see it.
 *
 * The one piece of real logic is effectiveVisibility, and it is the mirror of folder_chain_visible in
 * the content_privacy migration. It exists because an item's own level is not the whole truth: a note
 * marked Everyone inside a private folder is visible to exactly one person, and a badge that said
 * "Everyone" there would be lying about something that matters. The two are kept deliberately
 * identical, the same way lib/taskLifecycle.ts mirrors public.task_lifecycle.
 */

/** Every level, in the order they are offered — most private first. */
export const VISIBILITY_LEVELS: ContentVisibility[] = ['private', 'restricted', 'space']

/** What each level is called on screen. Never the database's word for it. */
export const VISIBILITY_LABELS: Record<ContentVisibility, string> = {
  private: 'Only me',
  restricted: 'Selected people',
  space: 'Everyone',
}

/**
 * The emoji-free glyph each level carries.
 *
 * Names rather than components, so this module stays importable by anything (including the checks,
 * which run outside React). The lookup to a lucide icon lives in the picker.
 */
export const VISIBILITY_ICONS: Record<ContentVisibility, 'lock' | 'users' | 'globe'> = {
  private: 'lock',
  restricted: 'users',
  space: 'globe',
}

/** One line under each option, in the words of somebody choosing. No permission vocabulary. */
export const VISIBILITY_SUMMARY: Record<ContentVisibility, string> = {
  private: 'Nobody else in this space can see it, or that it exists.',
  restricted: 'Only the people you choose. They can open it and get its reminders.',
  space: 'Everyone in this space can open it and get its reminders.',
}

export function isContentVisibility(value: unknown): value is ContentVisibility {
  return value === 'private' || value === 'restricted' || value === 'space'
}

/** Absent, unknown or malformed all read as Everyone — which is what every row written before this
 *  feature existed actually was. Matching the database's own coalesce. */
export function toVisibility(value: unknown): ContentVisibility {
  return isContentVisibility(value) ? value : 'space'
}

/**
 * Everything the app knows about sharing in the workspace it has loaded, by item.
 *
 * A map rather than fields on Folder and Task, following the same line space_id already sits on: the
 * workspace and who can reach a row are properties of the row's *context*, resolved at the repository
 * boundary, and the 43 components that call useFolders() have no business knowing which workspace
 * they are in. It also means a personal workspace carries none of this at all, rather than every
 * personal note carrying two fields that can only ever hold one value.
 */
export interface SharingIndex {
  folders: Map<string, ContentSharing>
  tasks: Map<string, ContentSharing>
}

export const EMPTY_SHARING_INDEX: SharingIndex = {
  folders: new Map(),
  tasks: new Map(),
}

export function buildSharingIndex(entries: ContentSharing[]): SharingIndex {
  const index: SharingIndex = { folders: new Map(), tasks: new Map() }
  for (const entry of entries) {
    const bucket = entry.entityType === 'folder' ? index.folders : index.tasks
    bucket.set(entry.entityId, entry)
  }
  return index
}

export function sharingFor(
  index: SharingIndex,
  entityType: ShareableEntity,
  entityId: string,
): ContentSharing | undefined {
  return entityType === 'folder' ? index.folders.get(entityId) : index.tasks.get(entityId)
}

/** The item's own level, with no reference to what is above it. 'space' when nothing is known, which
 *  is both the database default and the right answer for a personal workspace. */
export function ownVisibility(
  index: SharingIndex,
  entityType: ShareableEntity,
  entityId: string,
): ContentVisibility {
  return sharingFor(index, entityType, entityId)?.visibility ?? 'space'
}

/** Which of two levels reaches fewer people. The AND at the heart of the whole model. */
function narrower(a: ContentVisibility, b: ContentVisibility): ContentVisibility {
  const rank: Record<ContentVisibility, number> = { private: 0, restricted: 1, space: 2 }
  return rank[a] <= rank[b] ? a : b
}

/**
 * How far a folder actually reaches, once every folder above it has had its say.
 *
 * The mirror of folder_chain_visible: a thing is as visible as the *least* visible thing on the path
 * down to it. A folder marked Everyone inside a private folder is private, and saying so is the
 * difference between an interface that describes the system and one that quietly contradicts it.
 *
 * Inclusive of the folder named, so it answers both "how visible is this folder" and — passed a
 * task's folderId — "how far does the container reach".
 *
 * `restricted` at two levels is reported as `restricted`, even though the real audience is the
 * intersection of the two lists rather than either one. The badge's job is to say "some people, not
 * everyone"; the share sheet is where names live, and whose names those are is the database's answer
 * and never this function's.
 *
 * The depth guard mirrors the SQL's, for a related reason: this walks a parent chain assembled from a
 * server response, and a render pass is a bad place to discover a cycle.
 */
export function folderChainVisibility(
  index: SharingIndex,
  folders: Folder[],
  folderId: string | null,
): ContentVisibility {
  let level: ContentVisibility = 'space'
  let current = folderId
  let depth = 0

  while (current && depth <= 64) {
    level = narrower(level, ownVisibility(index, 'folder', current))
    if (level === 'private') {
      return 'private'
    }
    current = folders.find((folder) => folder.id === current)?.parentId ?? null
    depth += 1
  }
  return level
}

/**
 * The same question for a task: its own level, then the whole chain of folders holding it.
 *
 * The folder is passed in rather than looked up, so this is callable from a card that is already
 * holding it — which is every caller.
 */
export function effectiveTaskVisibility(
  index: SharingIndex,
  folders: Folder[],
  taskId: string,
  folderId: string,
): ContentVisibility {
  const own = ownVisibility(index, 'task', taskId)
  if (own === 'private') {
    return 'private'
  }
  return narrower(own, folderChainVisibility(index, folders, folderId))
}

/** Whether this item's own level is narrower than the folder holding it — the case worth explaining,
 *  because the badge and the picker will disagree and the reader deserves to know why. */
export function isNarrowedByParent(
  own: ContentVisibility,
  effective: ContentVisibility,
): boolean {
  return own !== effective
}

/**
 * "Shared with Yash and Rahul", and the rest of the sentences the share sheet says.
 *
 * Names, not counts, up to three: the point of the sentence is recognising the people, and "3 people"
 * is a number you then have to go and open something to understand. Beyond three it becomes a count
 * because the list stops being scannable.
 */
export function describeAudience(
  visibility: ContentVisibility,
  sharedWith: string[],
  members: SpaceMember[],
): string {
  if (visibility === 'private') {
    return 'Only you'
  }
  if (visibility === 'space') {
    return `Everyone in this space${members.length > 0 ? ` (${members.length})` : ''}`
  }
  const names = sharedWith
    .map((userId) => members.find((member) => member.userId === userId))
    .filter((member): member is SpaceMember => Boolean(member))
    .map((member) => member.fullName?.trim() || member.email)

  if (names.length === 0) {
    // The database coerces this state away (restricted with nobody named becomes private), so this
    // is only ever seen mid-edit, before anything has been saved.
    return 'Only you'
  }
  if (names.length <= 3) {
    return `You and ${new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names)}`
  }
  return `You and ${names.length} others`
}

/**
 * The one-line reassurance under the member picker.
 *
 * Says the thing the requirement asks be made clear — that choosing somebody here also decides who
 * gets the reminders — because the two being one decision is exactly what people do not expect, and
 * it is the whole point of the design.
 */
export function describeNotificationReach(
  visibility: ContentVisibility,
  count: number,
): string {
  if (visibility === 'private') {
    return 'Only you will get its reminders and emails.'
  }
  if (visibility === 'space') {
    return 'Everyone here can open it and receive its reminders.'
  }
  if (count === 0) {
    return 'With nobody selected, this stays visible to you alone.'
  }
  return `They can open this and receive its reminders. ${
    count === 1 ? 'Nobody else' : 'No one else'
  } will be notified about it.`
}
