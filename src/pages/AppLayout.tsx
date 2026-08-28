import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { Sidebar } from '../components/layout/Sidebar'
import { BottomNav } from '../components/layout/BottomNav'
import { useFolders } from '../hooks/useFolders'
import type { SidebarNavId } from '../types'
import { useTrackNavSection } from '../hooks/usePageEnterDirection'
import { useAuth } from '../hooks/useAuth'
import { NAV_DESTINATIONS, resolveDefaultPage } from '../lib/navOrder'

const SIDEBAR_COLLAPSED_KEY = 'mynotes-sidebar-collapsed'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1',
  )
  const navigate = useNavigate()
  const location = useLocation()
  const folderMatch = useMatch('/folder/:folderId')
  const taskMatch = useMatch('/task/:taskId')
  const { getChildFolders, getPath, getTask, uiState, toggleMyNotesSidebar } = useFolders()
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
    if (location.pathname !== '/') {
      return
    }
    const target = NAV_DESTINATIONS[resolveDefaultPage(user.user_metadata as Record<string, unknown>)]
    if (target.path !== '/') {
      navigate(target.path, { replace: true })
    }
    // Runs on the first render that has a signed-in account; the ref makes it once-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const activeNav: SidebarNavId | undefined =
    location.pathname === '/'
      ? 'important'
      : location.pathname === '/tree'
        ? 'tree'
        : location.pathname === '/mynotes'
          ? 'mynotes'
          : location.pathname === '/tasks'
            ? 'tasks'
            : undefined

  const goTo = (path: string) => {
    navigate(path)
  }

  const handleSelectNav = (id: SidebarNavId) => {
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
    profileActive: location.pathname === '/profile',
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

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <BottomNav
        activeNav={activeNav}
        profileActive={location.pathname === '/profile'}
        onSelectNav={handleSelectNav}
        onOpenProfile={() => goTo('/profile')}
      />
    </div>
  )
}
