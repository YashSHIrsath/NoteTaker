import type { SidebarNavId } from '../types'

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
 */
export const DEFAULT_NAV_ORDER: NavId[] = ['tree', 'mynotes', 'important', 'tasks', 'profile']

/** The pages worth opening onto. Not 'profile' — a settings screen is somewhere you go, not
 *  somewhere you start. */
export const DEFAULT_PAGE_CHOICES: SidebarNavId[] = ['tree', 'mynotes', 'important', 'tasks']

const NAV_ORDER_KEY = 'nav_order'
const DEFAULT_PAGE_KEY = 'default_page'

function isNavId(value: unknown): value is NavId {
  return typeof value === 'string' && value in NAV_DESTINATIONS
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
    if (isNavId(id) && !seen.has(id)) {
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

/** Which page a cold start opens on. Starred unless told otherwise, which is where "/" already
 *  went before this setting existed. */
export function readDefaultPage(metadata: Record<string, unknown> | undefined): SidebarNavId {
  const raw = metadata?.[DEFAULT_PAGE_KEY]
  return typeof raw === 'string' && (DEFAULT_PAGE_CHOICES as string[]).includes(raw)
    ? (raw as SidebarNavId)
    : 'important'
}

export function defaultPageUpdate(page: SidebarNavId): Record<string, string> {
  return { [DEFAULT_PAGE_KEY]: page }
}

/** Which section a route belongs to, or null for a route that is not one of the tabs. */
export function navIdForPath(pathname: string): NavId | null {
  for (const id of DEFAULT_NAV_ORDER) {
    if (NAV_DESTINATIONS[id].matches(pathname)) {
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
export function resolveDefaultPage(metadata: Record<string, unknown> | undefined): SidebarNavId {
  if (metadata) {
    return readDefaultPage(metadata)
  }
  return readCache()?.defaultPage ?? 'important'
}
