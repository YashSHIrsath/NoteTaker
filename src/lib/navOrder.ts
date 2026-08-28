import type { SidebarNavId } from '../types'
import { workspaceRelativePath } from './workspace'

/**
 * Every destination the bottom bar can hold, and where each one lives.
 *
 * One list, read by the bar that draws the tabs and by the hook that decides which side a page
 * slides in from. They used to be two hardcoded lists, and they drifted: the bar put Starred third
 * and Tasks fourth while the animation believed the opposite, so moving between those two slid the
 * wrong way. A shared order can't disagree with itself.
 */
export type NavId = SidebarNavId | 'profile'

export interface NavDestination {
  id: NavId
  label: string
  path: string
  /** Whether a given route belongs to this section. A folder counts as Notes and a note counts as
   *  Tasks, so stepping out of one still reads as a move from where you were. */
  matches: (pathname: string) => boolean
}

export const NAV_DESTINATIONS: Record<NavId, NavDestination> = {
  tree: {
    id: 'tree',
    label: 'Tree',
    path: '/tree',
    matches: (path) => path === '/tree',
  },
  mynotes: {
    id: 'mynotes',
    label: 'Notes',
    path: '/mynotes',
    matches: (path) => path === '/mynotes' || path.startsWith('/folder/'),
  },
  important: {
    id: 'important',
    label: 'Starred',
    path: '/',
    matches: (path) => path === '/',
  },
  tasks: {
    id: 'tasks',
    label: 'Tasks',
    path: '/tasks',
    matches: (path) => path === '/tasks' || path.startsWith('/task/'),
  },
  /**
   * Not a page of a workspace — a list of them.
   *
   * Which is why its path is absolute everywhere and never goes through spacePath: a space list
   * inside a space is nonsense, and tapping this from inside one is how you get back out.
   */
  spaces: {
    id: 'spaces',
    label: 'Spaces',
    path: '/spaces',
    matches: (path) => path === '/spaces',
  },
  profile: {
    id: 'profile',
    label: 'You',
    path: '/profile',
    matches: (path) => path === '/profile',
  },
}

/**
 * The order out of the box.
 *
 * Starred sits in the middle because Starred is "/" — what a cold start, a dead deep link and the
 * catch-all route all land on. The home tab belongs under the thumb at the centre of the bar, and
 * the centre slot is the one the indicator travels shortest to from either side.
 *
 * Spaces is not in it. It was, when the bottom bar had six tabs — but a list of workspaces is not
 * one of the places you work, and it now lives in the header on a phone and in a row of its own in
 * the sidebar. Leaving it in the order left a sixth entry in the reorder list that moved nothing:
 * the bar filtered it out and the sidebar drew its Spaces row wherever the entry happened to sit.
 */
export const DEFAULT_NAV_ORDER: NavId[] = ['tree', 'mynotes', 'important', 'tasks', 'profile']

/**
 * Every id a route can resolve to, which is the order plus Spaces.
 *
 * Kept separate because Spaces still has a page, and that page still has to light up its row and
 * slide in from a consistent side — dropping it from the matching would have made /spaces a route
 * that belongs to no section at all.
 */
const MATCHABLE_NAV_IDS: NavId[] = [...DEFAULT_NAV_ORDER, 'spaces']

/** The pages worth opening onto. Not 'profile' — a settings screen is somewhere you go, not
 *  somewhere you start — and not 'spaces', which is a list of workspaces rather than one to work in. */
export const DEFAULT_PAGE_CHOICES: SidebarNavId[] = ['tree', 'mynotes', 'important', 'tasks']

const NAV_ORDER_KEY = 'nav_order'
const DEFAULT_PAGE_KEY = 'default_page'
/**
 * Where you land, per space.
 *
 * One key holding `<spaceId>:<page>` pairs, comma-joined — the same encoding nav_order uses, and for
 * the same reason: user_metadata round-trips scalars far more predictably than it does objects, and
 * this is a short list of known tokens. DEFAULT_PAGE_KEY stays what it always was, the personal
 * workspace's choice, so nobody's existing preference moves.
 */
const SPACE_DEFAULT_PAGE_KEY = 'default_page_spaces'

/** An id the bar can hold. Spaces is a NavId and is deliberately not one of these — see
 *  DEFAULT_NAV_ORDER — so a stored order carrying it from an older build drops it on read. */
function isOrderableNavId(value: unknown): value is NavId {
  return typeof value === 'string' && (DEFAULT_NAV_ORDER as string[]).includes(value)
}

/**
 * The account's bar order, repaired into something usable whatever is stored.
 *
 * Anything unrecognised is dropped and anything missing is appended in default order, so a build
 * that adds a tab shows it rather than hiding it from everyone who ever reordered the bar, and a
 * hand-edited value can't produce a bar with a hole in it.
 */
export function readNavOrder(metadata: Record<string, unknown> | undefined): NavId[] {
  const raw = metadata?.[NAV_ORDER_KEY]
  const stored: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : []

  const seen = new Set<NavId>()
  const order: NavId[] = []
  for (const entry of stored) {
    const id = typeof entry === 'string' ? entry.trim() : entry
    if (isOrderableNavId(id) && !seen.has(id)) {
      seen.add(id)
      order.push(id)
    }
  }
  for (const id of DEFAULT_NAV_ORDER) {
    if (!seen.has(id)) {
      order.push(id)
    }
  }
  return order
}

/** Stored as a comma-joined string: user_metadata round-trips scalars far more predictably than
 *  arrays, and this is a short list of known tokens. */
export function navOrderUpdate(order: NavId[]): Record<string, string> {
  return { [NAV_ORDER_KEY]: order.join(',') }
}

function isPageChoice(value: unknown): value is SidebarNavId {
  return typeof value === 'string' && (DEFAULT_PAGE_CHOICES as string[]).includes(value)
}

/** The stored `<spaceId>:<page>` pairs, as a map. Anything unparseable is dropped rather than
 *  throwing: this is a hand-editable string in an account's metadata. */
function readSpaceDefaults(
  metadata: Record<string, unknown> | undefined,
): Record<string, SidebarNavId> {
  const raw = metadata?.[SPACE_DEFAULT_PAGE_KEY]
  if (typeof raw !== 'string' || !raw) {
    return {}
  }
  const result: Record<string, SidebarNavId> = {}
  for (const pair of raw.split(',')) {
    const separator = pair.lastIndexOf(':')
    if (separator <= 0) {
      continue
    }
    const spaceId = pair.slice(0, separator).trim()
    const page = pair.slice(separator + 1).trim()
    if (spaceId && isPageChoice(page)) {
      result[spaceId] = page
    }
  }
  return result
}

function writeSpaceDefaults(map: Record<string, SidebarNavId>): string {
  return Object.entries(map)
    .map(([spaceId, page]) => `${spaceId}:${page}`)
    .join(',')
}

/**
 * Which page a cold start opens on — for one workspace.
 *
 * Per workspace, and not inherited between them. It was one value for the whole account, so choosing
 * to open a shared space on Tasks also changed where your own notes opened, and the two settings
 * screens showed each other's answer. What you want to see first in a workspace several people share
 * is not what you want to see first in your own, and there is no reading of that preference under
 * which one should decide the other.
 *
 * Still personal, though: it is stored on the account, not on the space. Where you start is about
 * you, and there is no sense in which another member should choose it.
 *
 * A space nobody has set opens on Starred, which is where "/" already went before this setting
 * existed — deliberately not the personal choice, since falling back to it is the linkage this
 * removes.
 */
export function readDefaultPage(
  metadata: Record<string, unknown> | undefined,
  spaceId?: string | null,
): SidebarNavId {
  if (spaceId) {
    return readSpaceDefaults(metadata)[spaceId] ?? 'important'
  }
  const raw = metadata?.[DEFAULT_PAGE_KEY]
  return isPageChoice(raw) ? raw : 'important'
}

/**
 * The metadata patch for a choice.
 *
 * A space's choice has to be merged rather than written, because every space's answer lives in one
 * string — so this needs the metadata it is amending. Passing none writes the personal key, which
 * is a single scalar and needs nothing.
 */
export function defaultPageUpdate(
  page: SidebarNavId,
  spaceId?: string | null,
  metadata?: Record<string, unknown>,
): Record<string, string> {
  if (!spaceId) {
    return { [DEFAULT_PAGE_KEY]: page }
  }
  const next = { ...readSpaceDefaults(metadata), [spaceId]: page }
  return { [SPACE_DEFAULT_PAGE_KEY]: writeSpaceDefaults(next) }
}

/**
 * Which section a route belongs to, or null for a route that is not one of the tabs.
 *
 * Matched on the workspace-relative path, so /s/<space>/tree is the Tree section exactly as /tree
 * is. The `matches` predicates above all compare against personal-shaped paths; without this every
 * one of them would silently stop matching the moment you opened a shared space, and the bottom bar
 * would show no active tab while page transitions slid the wrong way.
 */
export function navIdForPath(pathname: string): NavId | null {
  const path = workspaceRelativePath(pathname)
  for (const id of MATCHABLE_NAV_IDS) {
    if (NAV_DESTINATIONS[id].matches(path)) {
      return id
    }
  }
  return null
}

/* ------------------------------------------------------------------ local echo
 *
 * The account is the source of truth — these live in user_metadata, which is why they follow you
 * onto the phone without anything syncing them explicitly. But a session resolves asynchronously,
 * and until it does `readNavOrder(undefined)` truthfully answers "the default". That meant the bar
 * painted in default order and then snapped, and a cold start briefly opened Starred before
 * redirecting to whichever page you actually chose — worst on mobile, where restoring the session
 * takes longest.
 *
 * So the last known answer is echoed to this device. It is a cache and never an authority: the
 * moment real metadata arrives it overwrites this, and a value here is only ever used to decide
 * what to draw in the gap before that happens.
 */
const CACHE_KEY = 'MINDSTACK_NAV_PREFS'

interface CachedNavPrefs {
  order: NavId[]
  defaultPage: SidebarNavId
  /** Per space, so opening a space link cold does not flash the personal choice first. */
  spaceDefaults: Record<string, SidebarNavId>
}

/**
 * Deliberately not keyed by user id, unlike the UI-state store.
 *
 * The whole point is to be readable before the session — and the user id arrives with the session.
 * A key that needs the answer it is trying to provide would never be read. Two accounts sharing a
 * browser therefore share one cached bar order for the first frame after a switch, and the real
 * metadata corrects it as soon as it lands. It decides an animation direction and a tab order, not
 * what anybody can see.
 */
export function cacheNavPreferences(metadata: Record<string, unknown> | undefined): void {
  if (!metadata) {
    return
  }
  try {
    const prefs: CachedNavPrefs = {
      order: readNavOrder(metadata),
      defaultPage: readDefaultPage(metadata),
      spaceDefaults: readSpaceDefaults(metadata),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs))
  } catch {
    /* A private window or a full quota: the app works, it just flashes the default order. */
  }
}

function readCache(): CachedNavPrefs | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const value = parsed as Record<string, unknown>
    return {
      // Run back through the same repair the metadata path uses, so a stale cache written by an
      // older build cannot produce a bar this one can't draw.
      order: readNavOrder({ nav_order: value.order }),
      defaultPage: readDefaultPage({ default_page: value.defaultPage }),
      spaceDefaults: readSpaceDefaults({
        [SPACE_DEFAULT_PAGE_KEY]: writeSpaceDefaults(
          (value.spaceDefaults ?? {}) as Record<string, SidebarNavId>,
        ),
      }),
    }
  } catch {
    return null
  }
}

/** The order to draw with: the account's when it has loaded, this device's last known before then. */
export function resolveNavOrder(metadata: Record<string, unknown> | undefined): NavId[] {
  if (metadata) {
    return readNavOrder(metadata)
  }
  return readCache()?.order ?? DEFAULT_NAV_ORDER
}

/** The page to open on, answerable before the session arrives. */
export function resolveDefaultPage(
  metadata: Record<string, unknown> | undefined,
  spaceId?: string | null,
): SidebarNavId {
  if (metadata) {
    return readDefaultPage(metadata, spaceId)
  }
  const cached = readCache()
  if (spaceId) {
    return cached?.spaceDefaults?.[spaceId] ?? 'important'
  }
  return cached?.defaultPage ?? 'important'
}
