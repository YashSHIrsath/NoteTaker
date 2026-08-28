/**
 * Which workspace the app is looking at.
 *
 * There are two kinds and they render through exactly the same screens: your own notes, and a space
 * several people hold together. Nothing about a shared note differs from a personal one except who
 * can reach it, so this is a reference to a *scope*, not a second data model — the repository reads
 * and writes one or the other, and the 43 components that call useFolders() never learn which.
 */
export type WorkspaceRef = { kind: 'personal' } | { kind: 'space'; id: string }

export const PERSONAL_WORKSPACE: WorkspaceRef = { kind: 'personal' }

/** Where a space lives in the URL. Personal keeps every path it has always had. */
const SPACE_PREFIX = '/s/'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSpaceId(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function spaceWorkspace(id: string): WorkspaceRef {
  return { kind: 'space', id }
}

/**
 * A stable string for one workspace, for anything that has to key by it.
 *
 * Used by the repository cache and by the per-device UI state store. That second one matters more
 * than it looks: expand/collapse state is keyed by account, and without the workspace in the key
 * your personal tree and a space's tree would share one set of open folders.
 */
export function workspaceKey(workspace: WorkspaceRef): string {
  return workspace.kind === 'personal' ? 'personal' : `space:${workspace.id}`
}

export function sameWorkspace(a: WorkspaceRef, b: WorkspaceRef): boolean {
  return workspaceKey(a) === workspaceKey(b)
}

/**
 * The address of a page inside a workspace.
 *
 * Every navigation in the app goes through here. Take the path the personal app has always used and
 * this returns where that page lives in the workspace you are actually in — which is the whole
 * reason a space can reuse the existing screens without any of them knowing about spaces.
 *
 * A path prefix rather than an ambient "current space" with unchanged URLs, because the prefix is
 * what makes a deep link, the back button, a refresh and a link to one shared note all work.
 */
export function spacePath(workspace: WorkspaceRef, path: string): string {
  if (workspace.kind === 'personal') {
    return path
  }
  const base = `${SPACE_PREFIX}${workspace.id}`
  // Starred is "/" in the personal app, and a space's Starred is the space's own root.
  return path === '/' ? base : `${base}${path}`
}

/**
 * The workspace a URL is in, and what the path would be in the personal app.
 *
 * The inverse of spacePath, and it exists because several things reason about *which page* this is
 * — which nav tab is active, which direction a page should slide in from — by comparing against
 * '/tree', '/tasks' and so on. Those comparisons have to happen on the personal-shaped path or
 * every one of them silently stops matching inside a space.
 */
export function parseWorkspacePath(pathname: string): { workspace: WorkspaceRef; path: string } {
  if (!pathname.startsWith(SPACE_PREFIX)) {
    return { workspace: PERSONAL_WORKSPACE, path: pathname }
  }
  const rest = pathname.slice(SPACE_PREFIX.length)
  const slash = rest.indexOf('/')
  const id = slash === -1 ? rest : rest.slice(0, slash)
  if (!isSpaceId(id)) {
    return { workspace: PERSONAL_WORKSPACE, path: pathname }
  }
  const path = slash === -1 ? '/' : rest.slice(slash)
  return { workspace: spaceWorkspace(id), path: path === '' ? '/' : path }
}

/** The personal-shaped path for a URL, whichever workspace it is in. */
export function workspaceRelativePath(pathname: string): string {
  return parseWorkspacePath(pathname).path
}
