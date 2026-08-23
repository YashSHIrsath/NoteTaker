import { useState } from 'react'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { Sidebar } from '../components/layout/Sidebar'
import { BottomNav } from '../components/layout/BottomNav'
import { useFolders } from '../hooks/useFolders'
import type { SidebarNavId } from '../types'
import { useTrackNavSection } from '../hooks/usePageEnterDirection'

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

  const activeNav: SidebarNavId | undefined =
    location.pathname === '/'
      ? 'tree'
      : location.pathname === '/mynotes'
        ? 'mynotes'
        : location.pathname === '/tasks'
          ? 'tasks'
          : location.pathname === '/important'
            ? 'important'
            : undefined

  const goTo = (path: string) => {
    navigate(path)
  }

  const handleSelectNav = (id: SidebarNavId) => {
    if (id === 'tree') {
      goTo('/')
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
    goTo('/important')
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
