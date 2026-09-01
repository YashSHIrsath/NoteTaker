import { useEffect, useRef, useState } from 'react'
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { Sidebar } from '../components/layout/Sidebar'
import { BottomNav } from '../components/layout/BottomNav'
import { useFolders } from '../hooks/useFolders'
import { PullToRefresh } from '../components/common/PullToRefresh'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { useRefreshWorkspace } from '../hooks/useRefreshWorkspace'
import type { SidebarNavId } from '../types'
import { useTrackNavSection } from '../hooks/usePageEnterDirection'
import { useAuth } from '../hooks/useAuth'
import { NAV_DESTINATIONS, resolveDefaultPage } from '../lib/navOrder'
import { useSpaceId, useWorkspacePath } from '../hooks/useWorkspace'
import { workspaceRelativePath } from '../lib/workspace'

const SIDEBAR_COLLAPSED_KEY = 'mynotes-sidebar-collapsed'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
  )
  const navigate = useNavigate()
  const location = useLocation()
  /**
   * Where this page sits, said in personal-app terms.
   *
   * Everything below decides what to highlight and where to go by comparing against '/tree',
   * '/tasks' and so on. Inside a space the real pathname is '/s/<id>/tree', so the comparisons run
   * against the relative path and the destinations are put back through `to()` on the way out.
   */
  const relativePath = workspaceRelativePath(location.pathname)
  const to = useWorkspacePath()
  const spaceId = useSpaceId()
  /*
   * matchPath, not useMatch, and against the relative path.
   *
   * One pattern covers both mounts of the page this way, because the space prefix is already gone.
   * The version this replaced tried `useMatch(personal) ?? useMatch(space)` — which is a hook behind
   * a short-circuit: on /folder/x the left side matched and the right hook was never called, so the
   * hook count changed between renders and React tore the layout down. matchPath is an ordinary
   * function, so there is nothing to get out of order.
   */
  const folderMatch = matchPath('/folder/:folderId', relativePath)
  const taskMatch = matchPath('/task/:taskId', relativePath)
  const { getChildFolders, getPath, getTask, uiState, toggleMyNotesSidebar } = useFolders()
  // One gesture, one meaning, on every page below: ask the server for everything this screen shows.
  const refresh = useRefreshWorkspace()
  const rootFolders = getChildFolders(null)

  const folderId = folderMatch?.params.folderId
  const task = taskMatch?.params.taskId
    ? getTask(taskMatch.params.taskId)
    : undefined
  const folderPath = folderId
    ? getPath(folderId)
    : task
      ? getPath(task.folderId)
      : []
  const activeFolderId = folderPath[0]?.id
  // Every route passes through here, so this is where the section you're leaving gets recorded.
  // The pages that animate their arrival can only see one section back, and only the sections
  // that ask — so the asking has to happen for all of them, in one place.
  useTrackNavSection()

  /**
   * Opens the page the account chose, once per load.
   *
   * "/" is Starred and also the catch-all every cold start, dead link and reload lands on, so the
   * preference is applied by redirecting away from it rather than by changing what "/" renders —
   * which keeps the URL honest about which page you are actually looking at, and keeps Starred
   * reachable at the address it has always had.
   *
   * Guarded by a ref rather than by the pathname: without it, navigating back to Starred on
   * purpose would be read as another cold start and bounce you straight out again.
   */
  const { user } = useAuth()
  const appliedDefaultPage = useRef(false)
  useEffect(() => {
    if (appliedDefaultPage.current || !user) {
      return
    }
    appliedDefaultPage.current = true
    if (relativePath !== '/') {
      return
    }
    // This workspace's answer, not the account's one answer. A space you share with four people and
    // your own notes are opened for different reasons, and the choice used to be a single value —
    // so setting one set the other, and both settings screens showed the same thing.
    const target =
      NAV_DESTINATIONS[
        resolveDefaultPage(user.user_metadata as Record<string, unknown>, spaceId)
      ]
    if (target.path !== '/') {
      navigate(to(target.path), { replace: true })
    }
    // Runs on the first render that has a signed-in account; the ref makes it once-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const activeNav: SidebarNavId | undefined =
    relativePath === '/'
      ? 'important'
      : relativePath === '/tree'
        ? 'tree'
        : relativePath === '/mynotes'
          ? 'mynotes'
          : relativePath === '/tasks'
            ? 'tasks'
            : relativePath === '/spaces'
              ? 'spaces'
              : undefined

  // Every destination in this file goes through here, so a tab tapped inside a space stays in it.
  const goTo = (path: string) => {
    navigate(to(path))
  }

  const handleSelectNav = (id: SidebarNavId) => {
    if (id === 'spaces') {
      // Absolute on purpose: a space list is not a page *of* a workspace, so this leaves whichever
      // one you are in rather than looking for /s/<id>/spaces.
      navigate('/spaces')
      return
    }
    if (id === 'tree') {
      goTo('/tree')
      return
    }
    if (id === 'mynotes') {
      goTo('/mynotes')
      return
    }
    if (id === 'tasks') {
      goTo('/tasks')
      return
    }
    goTo('/')
  }

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  const sidebarProps = {
    rootFolders,
    myNotesExpanded: uiState.myNotesSidebarExpanded,
    onToggleMyNotes: toggleMyNotesSidebar,
    activeNav,
    activeFolderId,
    onSelectNav: handleSelectNav,
    onSelectFolder: (folderId: string) => goTo(`/folder/${folderId}`),
    onOpenProfile: () => goTo('/profile'),
    profileActive: relativePath === '/profile',
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      <Header />

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar from lg up only; below that the bottom bar is the navigation. */}
        <Sidebar
          {...sidebarProps}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          className="hidden lg:flex"
        />

        {/* `overscroll-y-contain` is not decoration: without it Chrome on Android answers a pull
          * at the top of the page with its own reload, throwing away the app's state to fetch the
          * same data PullToRefresh is already fetching in place. */}
        <main className="min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
          <PullToRefresh onRefresh={refresh}>
            {/* Keyed by the path: a screen that threw is left behind by navigating away, which is
              * why this one sits inside the shell — the header and the bottom bar stay live, so
              * there is somewhere to navigate *to*. */}
            <ErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </PullToRefresh>
        </main>
      </div>

      {/* Spaces is not one of these below `lg` — it is the button in the header. The bar is the
        * five places you work: Tree, Notes, Starred, Tasks, and the account (which inside a space
        * is the space's own page). See BottomNav, which drops it from the order. */}
      <BottomNav
        activeNav={activeNav}
        profileActive={relativePath === '/profile'}
        onSelectNav={handleSelectNav}
        onOpenProfile={() => goTo('/profile')}
      />
    </div>
  )
}
