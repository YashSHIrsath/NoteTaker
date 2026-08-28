import { NAV_DESTINATIONS, navIdForPath, type NavId } from '../../lib/navOrder'
import {
  PERSONAL_WORKSPACE,
  isSpaceId,
  parseWorkspacePath,
  sameWorkspace,
  spacePath,
  spaceWorkspace,
  workspaceKey,
  workspaceRelativePath,
} from '../../lib/workspace'
import { getNotesRepository } from '../../repositories'
import { loadPersistedUiState, persistUiState } from '../../repositories/supabase/uiStateStore'
import { getSupabaseClient } from '../../lib/supabase'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const SPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_SPACE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SPACE = spaceWorkspace(SPACE_ID)

/**
 * Every page of the app has an address in every workspace, and the two directions agree.
 *
 * This is the property the whole phase rests on. A space reuses the existing screens, and those
 * screens decide what to highlight and where to go by comparing paths against '/tree', '/tasks' and
 * so on. If spacePath and parseWorkspacePath ever disagreed, the comparisons would quietly stop
 * matching inside a space: no active tab, page transitions sliding the wrong way, and a "back to
 * Notes" that walked out of the space.
 */
function checkPathRoundTrip(): void {
  const pages = ['/', '/tree', '/mynotes', '/tasks', '/profile', '/folder/abc', '/task/xyz']

  for (const page of pages) {
    assert(spacePath(PERSONAL_WORKSPACE, page) === page, `personal keeps ${page} unchanged`)

    const inSpace = spacePath(SPACE, page)
    assert(inSpace.startsWith(`/s/${SPACE_ID}`), `${page} in a space is under /s/<id>`)

    const parsed = parseWorkspacePath(inSpace)
    assert(sameWorkspace(parsed.workspace, SPACE), `${inSpace} parses back to its space`)
    assert(parsed.path === page, `${inSpace} parses back to ${page}, got ${parsed.path}`)
  }

  // Starred is "/" in the personal app, so a space's Starred is the space's own root rather than a
  // trailing slash — two spellings of one page would break every equality comparison downstream.
  assert(spacePath(SPACE, '/') === `/s/${SPACE_ID}`, "a space's Starred is its root")
  assert(workspaceRelativePath(`/s/${SPACE_ID}`) === '/', "a space's root reads as /")

  // A personal path is its own relative path, and a personal parse never invents a space.
  assert(parseWorkspacePath('/tree').workspace.kind === 'personal', '/tree is personal')
  assert(workspaceRelativePath('/tree') === '/tree', 'a personal path is unchanged')

  // Junk in the space slot is not a space. Left unchecked, '/s/../tree' would produce a repository
  // pointed at a space id that cannot exist and a load that fails instead of a redirect.
  assert(!isSpaceId('not-a-uuid'), 'a non-uuid is not a space id')
  assert(!isSpaceId(undefined), 'a missing id is not a space id')
  assert(isSpaceId(SPACE_ID), 'a uuid is a space id')
  assert(
    parseWorkspacePath('/s/not-a-uuid/tree').workspace.kind === 'personal',
    'a malformed space path is not treated as a space',
  )
}

/** The bottom bar and the page-transition direction both read this, in both workspaces. */
function checkNavSections(): void {
  const cases: Array<[string, NavId]> = [
    ['/', 'important'],
    ['/tree', 'tree'],
    ['/mynotes', 'mynotes'],
    ['/folder/abc', 'mynotes'],
    ['/tasks', 'tasks'],
    ['/task/abc', 'tasks'],
    ['/profile', 'profile'],
  ]

  for (const [path, expected] of cases) {
    assert(navIdForPath(path) === expected, `${path} is the ${expected} section`)
    const inSpace = spacePath(SPACE, path)
    assert(
      navIdForPath(inSpace) === expected,
      `${inSpace} is also the ${expected} section, got ${String(navIdForPath(inSpace))}`,
    )
  }

  assert(navIdForPath('/login') === null, 'a route outside the tabs has no section')

  // Every destination the bar can hold has to survive the round trip, or tapping that tab inside a
  // space would leave the space.
  for (const destination of Object.values(NAV_DESTINATIONS)) {
    const inSpace = spacePath(SPACE, destination.path)
    assert(
      parseWorkspacePath(inSpace).path === destination.path,
      `${destination.id} keeps its path inside a space`,
    )
  }
}

/** One key per workspace, and the personal one unchanged from before spaces existed. */
function checkWorkspaceKeys(): void {
  assert(workspaceKey(PERSONAL_WORKSPACE) === 'personal', 'personal has a stable key')
  assert(workspaceKey(SPACE) === `space:${SPACE_ID}`, 'a space is keyed by its id')
  assert(
    workspaceKey(SPACE) !== workspaceKey(spaceWorkspace(OTHER_SPACE_ID)),
    'two spaces are two keys',
  )
  assert(sameWorkspace(SPACE, spaceWorkspace(SPACE_ID)), 'the same space compares equal')
  assert(!sameWorkspace(SPACE, PERSONAL_WORKSPACE), 'a space is not personal')
}

/**
 * Expand/collapse state is per workspace, not just per account.
 *
 * Shared before this, which meant opening a folder in a space opened whatever folder happened to
 * carry the same id in your personal tree — and both wrote over each other on every toggle.
 */
function checkUiStateIsolation(): void {
  if (typeof window === 'undefined') {
    return
  }
  const userId = '11111111-1111-4111-8111-111111111111'
  const before = window.localStorage.length

  persistUiState(
    { ...loadPersistedUiState(userId), expandedFolderIds: ['personal-folder'] },
    userId,
    PERSONAL_WORKSPACE,
  )
  persistUiState(
    { ...loadPersistedUiState(userId, SPACE), expandedFolderIds: ['space-folder'] },
    userId,
    SPACE,
  )

  assert(
    loadPersistedUiState(userId, PERSONAL_WORKSPACE).expandedFolderIds[0] === 'personal-folder',
    'personal expand state is its own',
  )
  assert(
    loadPersistedUiState(userId, SPACE).expandedFolderIds[0] === 'space-folder',
    'a space keeps its own expand state',
  )
  assert(
    loadPersistedUiState(userId).expandedFolderIds[0] === 'personal-folder',
    'the default workspace is personal, so the old call shape still reads personal state',
  )
  assert(
    loadPersistedUiState(userId, spaceWorkspace(OTHER_SPACE_ID)).expandedFolderIds.length === 0,
    'a space that has never been opened starts with nothing expanded',
  )
  assert(window.localStorage.length >= before, 'ui state is written, not swapped in place')
}

/**
 * A repository per workspace, and the same one every time.
 *
 * Identity matters as much as scope here: FolderProvider derives its repository on every render and
 * feeds it to the load effect's dependencies, so a fresh instance per render would reload the
 * document forever.
 */
function checkRepositoryScoping(): void {
  const personal = getNotesRepository(PERSONAL_WORKSPACE)
  assert(personal === getNotesRepository(PERSONAL_WORKSPACE), 'personal repository is remembered')
  assert(personal === getNotesRepository(), 'the default workspace is personal')

  if (!getSupabaseClient()) {
    /*
     * No server configured, so there is nothing for a space to be — and the refusal is the
     * behaviour under test rather than a gap in it. A shared space is other people, and there is
     * nobody else inside one browser's LocalStorage; handing back a local document would give one
     * person a private copy of a workspace they think they are sharing.
     */
    let refused = false
    try {
      getNotesRepository(SPACE)
    } catch {
      refused = true
    }
    assert(refused, 'a space refuses to be backed by LocalStorage')
    return
  }

  const space = getNotesRepository(SPACE)
  assert(space === getNotesRepository(spaceWorkspace(SPACE_ID)), 'a space repository is remembered')
  assert(space !== personal, 'a space does not share the personal repository')
  assert(
    space !== getNotesRepository(spaceWorkspace(OTHER_SPACE_ID)),
    'two spaces do not share a repository',
  )
}

export function runWorkspaceChecks(): void {
  checkPathRoundTrip()
  checkNavSections()
  checkWorkspaceKeys()
  checkUiStateIsolation()
  checkRepositoryScoping()
}
