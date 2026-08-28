import { useEffect, useMemo } from 'react'
import { Navigate, Outlet, useParams } from 'react-router-dom'
import { FolderProvider } from '../context/FolderContext'
import { SpacesProvider } from '../context/SpacesContext'
import { WorkspaceProvider } from '../context/WorkspaceContext'
import { useAppFonts } from '../hooks/useAppFonts'
import { useSpaces } from '../hooks/useSpaces'
import { getSupabaseClient } from '../lib/supabase'
import { spaceAccentStyle } from '../lib/spaceColor'
import { cn } from '../lib/cn'
import type { TaskPaletteColor } from '../types'
import {
  PERSONAL_WORKSPACE,
  isSpaceId,
  spaceWorkspace,
  type WorkspaceRef,
} from '../lib/workspace'

/**
 * The space's colour, on the document itself rather than on the shell.
 *
 * It was on the shell `div`, which tints every screen but stops at the edge of the React tree —
 * and the dialogs, menus and the mobile workspace sheet all portal to `document.body`, outside it.
 * So the one place you were most likely to do something irreversible in the wrong workspace —
 * a confirm dialog — was also the one place still wearing the personal accent. Stamping the root
 * puts every portal inside the theme, since they are all descendants of it.
 *
 * Removed on the way out, so leaving a space leaves nothing behind.
 */
function useSpaceTheme(spaceId: string | null, color: TaskPaletteColor | null): void {
  useEffect(() => {
    if (!spaceId) {
      return
    }
    const root = document.documentElement
    const variables = spaceAccentStyle(spaceId, color) as Record<string, string>
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value)
    }
    root.classList.add('space-theme')
    return () => {
      for (const name of Object.keys(variables)) {
        root.style.removeProperty(name)
      }
      root.classList.remove('space-theme')
    }
  }, [color, spaceId])
}

/**
 * Which spaces this account can reach, above everything that needs to know.
 *
 * Both the Shared Spaces page and the space shell read it, and the shell cannot also be the thing
 * that supplies it — so it sits above both, outside either workspace's provider. It spans all
 * workspaces, which is also why it must not live inside FolderProvider: that one is remounted every
 * time you move between them.
 */
export function SpacesShell() {
  // The chosen faces go on <html> from here: this wraps every signed-in route and nothing else, so
  // the landing page keeps the ones it was written in. See useAppFonts.
  useAppFonts()
  return (
    <SpacesProvider>
      <Outlet />
    </SpacesProvider>
  )
}

/**
 * Everything below reads one workspace.
 *
 * The same shell for your own notes and for a shared space, because the difference between them is
 * a scope and not a screen: WorkspaceProvider says which one, FolderProvider loads it, and the
 * pages underneath are the ones that already existed.
 */
function WorkspaceShell({
  workspace,
  className,
}: {
  workspace: WorkspaceRef
  className?: string
}) {
  return (
    <div className={cn('h-full', className)}>
      <WorkspaceProvider workspace={workspace}>
        <FolderProvider>
          <Outlet />
        </FolderProvider>
      </WorkspaceProvider>
    </div>
  )
}

/** The account's own notes, at the paths they have always been at, in the app's own colour. */
export function AuthenticatedApp() {
  return <WorkspaceShell workspace={PERSONAL_WORKSPACE} />
}

/**
 * A shared space, at /s/:spaceId.
 *
 * Two things happen here that don't happen for personal notes. The space's colour is put on the
 * shell, which repoints every accent token in the app — a safety feature more than a decorative
 * one, since once a shared workspace renders through exactly the same screens as your own, "which
 * one am I in" is a question with a costly wrong answer. And the shell arrives with a short rise,
 * so the change of workspace is something you see rather than something you have to read.
 *
 * Navigating between two spaces changes the param without remounting this, which is what we want:
 * FolderProvider stays in place, notices its repository changed, flushes what it had queued for the
 * space being left and loads the new one.
 */
export function SpaceApp() {
  const { spaceId } = useParams()
  const { getSpace } = useSpaces()
  const workspace = useMemo(
    () => (isSpaceId(spaceId) ? spaceWorkspace(spaceId) : null),
    [spaceId],
  )
  // The colour comes from the space list, which may not have arrived yet. Until it does the app
  // keeps its own accent rather than guessing — a colour that changed a beat after you walked in
  // would read as a glitch. Read before the redirects below, because the hook cannot be.
  const space = isSpaceId(spaceId) ? getSpace(spaceId) : undefined
  useSpaceTheme(space ? spaceId ?? null : null, space?.color ?? null)

  /*
   * A truncated or mistyped link, or a space link opened in a build with no server configured.
   *
   * Both land on your own notes. The alternative is a screen that renders as an empty space, which
   * is indistinguishable from a space you have been removed from — and being quietly shown "there
   * is nothing here" is the wrong answer to "this address is not a space".
   */
  if (!workspace || !isSpaceId(spaceId) || !getSupabaseClient()) {
    return <Navigate to="/" replace />
  }

  // The tint itself is on the document — see useSpaceTheme. This is only the arrival.
  return <WorkspaceShell workspace={workspace} className="anim-space-enter" />
}

/** Anything unmatched inside a space goes to that space's front page, not out of the space. */
export function SpaceFallback() {
  const { spaceId } = useParams()
  return <Navigate to={isSpaceId(spaceId) ? `/s/${spaceId}` : '/'} replace />
}
