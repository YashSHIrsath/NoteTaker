import type { ContentSharing, Folder, SpaceMember } from '../../types'
import {
  EMPTY_SHARING_INDEX,
  buildSharingIndex,
  describeAudience,
  describeNotificationReach,
  effectiveTaskVisibility,
  folderChainVisibility,
  isNarrowedByParent,
  ownVisibility,
  sharingFor,
  toVisibility,
} from '../../lib/contentPrivacy'
import { sharingFromRows } from '../../repositories/supabase/mappers'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * The app's side of per-item privacy, checked.
 *
 * None of this is what keeps anybody out — RLS does that, and supabase/tests/content_privacy_checks.sql
 * is where that claim is tested, against a real database. What is checked here is the *description*:
 * whether the badge on a row tells the truth about how far that row reaches.
 *
 * That matters more than it sounds. The rule is an AND down the folder chain, so an item's own setting
 * is routinely not the answer — a note marked Everyone inside a private folder reaches one person. An
 * interface that reported the setting instead of the reach would be telling people their private work
 * was shared, or worse, that their shared work was private. The database would still be right, and
 * every decision made by the person reading the screen would be wrong.
 */

const A = 'user-a'
const B = 'user-b'
const C = 'user-c'

function folder(id: string, parentId: string | null = null): Folder {
  return { id, name: id, parentId, isImportant: false, sortOrder: 0 }
}

function sharing(
  entityType: 'folder' | 'task',
  entityId: string,
  visibility: ContentSharing['visibility'],
  sharedWith: string[] = [],
  ownerId = A,
): ContentSharing {
  return { entityType, entityId, visibility, ownerId, canManage: ownerId === A, sharedWith }
}

/** An unknown or absent level reads as Everyone — the same coalesce the database does, and the reason
 *  a row written before this feature existed still renders correctly. */
function checkVisibilityParsing(): void {
  assert(toVisibility('private') === 'private', 'a known level survives')
  assert(toVisibility('restricted') === 'restricted', 'a known level survives')
  assert(toVisibility('space') === 'space', 'a known level survives')
  assert(toVisibility(null) === 'space', 'an absent level is Everyone')
  assert(toVisibility(undefined) === 'space', 'an undefined level is Everyone')
  assert(toVisibility('nonsense') === 'space', 'an unrecognised level is Everyone, not a crash')
}

function checkIndexLookup(): void {
  const index = buildSharingIndex([
    sharing('folder', 'f1', 'private'),
    sharing('task', 'f1', 'space'),
  ])

  // The same id can name a folder and a task. Keying them together would have one shadow the other,
  // and the shadowed one would render with the wrong badge.
  assert(sharingFor(index, 'folder', 'f1')?.visibility === 'private', 'folders are keyed apart')
  assert(sharingFor(index, 'task', 'f1')?.visibility === 'space', 'tasks are keyed apart')
  assert(sharingFor(index, 'task', 'missing') === undefined, 'an unknown id is undefined')
  assert(ownVisibility(index, 'task', 'missing') === 'space', 'an unknown id reads as Everyone')
  assert(
    ownVisibility(EMPTY_SHARING_INDEX, 'folder', 'f1') === 'space',
    'a personal workspace has no privacy and everything reads as Everyone',
  )
}

/**
 * The AND, in both directions and to depth.
 *
 * This is the mirror of folder_chain_visible, and the property it has to have is that the *narrowest*
 * thing on the path wins wherever it sits — not just the immediate parent.
 */
function checkChain(): void {
  const folders = [
    folder('root'),
    folder('mid', 'root'),
    folder('leaf', 'mid'),
  ]

  const open = buildSharingIndex([
    sharing('folder', 'root', 'space'),
    sharing('folder', 'mid', 'space'),
    sharing('folder', 'leaf', 'space'),
  ])
  assert(folderChainVisibility(open, folders, 'leaf') === 'space', 'an open chain stays open')

  // A restriction at the top, two levels above the row being drawn.
  const privateRoot = buildSharingIndex([
    sharing('folder', 'root', 'private'),
    sharing('folder', 'mid', 'space'),
    sharing('folder', 'leaf', 'space'),
  ])
  assert(
    folderChainVisibility(privateRoot, folders, 'leaf') === 'private',
    'a private grandparent makes a leaf private',
  )

  // And in the middle.
  const privateMid = buildSharingIndex([
    sharing('folder', 'root', 'space'),
    sharing('folder', 'mid', 'restricted', [B]),
    sharing('folder', 'leaf', 'space'),
  ])
  assert(
    folderChainVisibility(privateMid, folders, 'leaf') === 'restricted',
    'a restricted parent narrows an open child',
  )

  // A child may always be narrower than its parent. This is the direction the model allows.
  const privateLeaf = buildSharingIndex([
    sharing('folder', 'root', 'space'),
    sharing('folder', 'mid', 'space'),
    sharing('folder', 'leaf', 'private'),
  ])
  assert(
    folderChainVisibility(privateLeaf, folders, 'leaf') === 'private',
    'a private child inside an open parent is private',
  )
  assert(
    folderChainVisibility(privateLeaf, folders, 'mid') === 'space',
    'and it does not narrow the folder above it',
  )

  assert(folderChainVisibility(open, folders, null) === 'space', 'a root has nothing above it')
}

/** The brief's own example, drawn as the app would draw it. */
function checkTaskVisibility(): void {
  const folders = [folder('shared'), folder('locked')]
  const index = buildSharingIndex([
    sharing('folder', 'shared', 'space'),
    sharing('folder', 'locked', 'private'),
    sharing('task', 'open', 'space'),
    sharing('task', 'some', 'restricted', [B]),
    sharing('task', 'mine', 'private'),
    sharing('task', 'openInLocked', 'space'),
  ])

  assert(
    effectiveTaskVisibility(index, folders, 'open', 'shared') === 'space',
    'an open note in an open folder is open',
  )
  assert(
    effectiveTaskVisibility(index, folders, 'some', 'shared') === 'restricted',
    'a restricted note in an open folder is restricted',
  )
  assert(
    effectiveTaskVisibility(index, folders, 'mine', 'shared') === 'private',
    'a private note in an open folder stays private — the case the brief leads with',
  )
  assert(
    effectiveTaskVisibility(index, folders, 'openInLocked', 'locked') === 'private',
    'an open note in a private folder is private, because the folder decides',
  )

  // And that last one is the case the badge has to explain rather than simply state.
  assert(
    isNarrowedByParent(
      ownVisibility(index, 'task', 'openInLocked'),
      effectiveTaskVisibility(index, folders, 'openInLocked', 'locked'),
    ),
    'a note narrowed by its folder is flagged as such',
  )
  assert(
    !isNarrowedByParent(
      ownVisibility(index, 'task', 'mine'),
      effectiveTaskVisibility(index, folders, 'mine', 'shared'),
    ),
    'a note that chose its own level is not flagged',
  )
}

/**
 * The sentences.
 *
 * Worth checking because they are the whole interface: "Who can see this?" is answered by a string,
 * and a string that says "Only you" about something two other people can read is the failure this
 * feature is supposed to prevent.
 */
function checkSentences(): void {
  const members: SpaceMember[] = [
    { userId: A, role: 'owner', joinedAt: '', email: 'a@x.test', fullName: 'Yash', avatarUrl: null },
    { userId: B, role: 'editor', joinedAt: '', email: 'b@x.test', fullName: 'Rahul', avatarUrl: null },
    { userId: C, role: 'editor', joinedAt: '', email: 'c@x.test', fullName: null, avatarUrl: null },
  ]

  assert(describeAudience('private', [], members) === 'Only you', 'private is only you')
  assert(
    describeAudience('private', [B], members) === 'Only you',
    'a stale grant cannot make a private item read as shared',
  )
  assert(
    describeAudience('restricted', [B], members) === 'You and Rahul',
    'one name is named',
  )
  assert(
    describeAudience('restricted', [B, C], members) === 'You and Rahul and c@x.test',
    'somebody with no name is shown by address rather than omitted',
  )
  assert(
    describeAudience('restricted', [], members) === 'Only you',
    'selected people with nobody selected is Only you — matching what the database stores',
  )
  assert(
    describeAudience('restricted', ['gone'], members).startsWith('Only you'),
    'a grant naming somebody no longer in the space is dropped, not rendered as blank',
  )
  assert(
    describeAudience('space', [], members).startsWith('Everyone in this space'),
    'everyone is everyone',
  )

  // The line that says access and notifications are one decision.
  assert(
    describeNotificationReach('private', 0).includes('Only you'),
    'a private item notifies only its owner',
  )
  assert(
    describeNotificationReach('restricted', 0).includes('you alone'),
    'nobody selected is described as staying private, not as a shared state',
  )
  assert(
    describeNotificationReach('restricted', 2).includes('reminders'),
    'choosing people says out loud that they will get the reminders',
  )
}

/**
 * The repository boundary: three separate reads folded into one answer.
 *
 * `canManage` is the one permission this app computes for itself, so it is worth pinning. It decides
 * whether to *offer* the share sheet, and set_content_visibility refuses anybody but the owner
 * regardless — so a wrong answer here shows a control that then declines, and never lets anybody
 * through.
 */
function checkRowAssembly(): void {
  const entries = sharingFromRows(
    [
      { id: 'f1', parent_id: null, name: 'Mine', is_important: false, sort_order: 0, visibility: 'private', owner_id: A },
      { id: 'f2', parent_id: null, name: 'Theirs', is_important: false, sort_order: 0, visibility: 'space', owner_id: B },
    ],
    [
      {
        id: 't1', folder_id: 'f1', title: 'x', content: '', is_important: false, is_pinned: false,
        pinned_scopes: [], sort_order: 0, note_kind: 'note', due_at: null, completed: false,
        completed_at: null, tags: [], color: null, grid_layout: null,
        visibility: 'restricted', owner_id: A,
      },
    ],
    [
      { entity_type: 'task', entity_id: 't1', user_id: B },
      { entity_type: 'task', entity_id: 't1', user_id: C },
    ],
    A,
  )

  const index = buildSharingIndex(entries)
  assert(index.folders.size === 2 && index.tasks.size === 1, 'every row gets an entry')
  assert(sharingFor(index, 'folder', 'f1')?.canManage === true, 'the viewer manages what they own')
  assert(
    sharingFor(index, 'folder', 'f2')?.canManage === false,
    'and does not manage what somebody else owns — not even as a space admin',
  )
  assert(
    sharingFor(index, 'task', 't1')?.sharedWith.length === 2,
    'grants are gathered onto the item they name',
  )
  assert(
    sharingFor(index, 'folder', 'f2')?.sharedWith.length === 0,
    'an item with no grants gets an empty list rather than undefined',
  )

  // A row from a database that predates the columns, read as what it actually was.
  const legacy = sharingFromRows(
    [{ id: 'f3', parent_id: null, name: 'Old', is_important: false, sort_order: 0, visibility: null, owner_id: null }],
    [],
    [],
    A,
  )
  assert(legacy[0].visibility === 'space', 'a row with no level reads as Everyone')
  assert(legacy[0].canManage === false, 'and a row with no owner is managed by nobody')
}

export function runPrivacyChecks(): void {
  checkVisibilityParsing()
  checkIndexLookup()
  checkChain()
  checkTaskVisibility()
  checkSentences()
  checkRowAssembly()
}
