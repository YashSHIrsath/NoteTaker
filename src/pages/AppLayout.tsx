import { useState } from 'react'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { Header } from '../components/layout/Header'
import { Sidebar } from '../components/layout/Sidebar'
import { useFolders } from '../hooks/useFolders'
import type { SidebarNavId } from '../types'
import { cn } from '../lib/cn'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
  const activeNav: SidebarNavId | undefined =
    location.pathname === '/'
      ? 'tree'
      : location.pathname === '/mynotes'
        ? 'mynotes'
        : location.pathname === '/important'
          ? 'important'
          : undefined

  const goTo = (path: string) => {
    navigate(path)
    setSidebarOpen(false)
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
    goTo('/important')
  }

  const sidebarProps = {
    rootFolders,
    myNotesExpanded: uiState.myNotesSidebarExpanded,
    onToggleMyNotes: toggleMyNotesSidebar,
    activeNav,
    activeFolderId,
    onSelectNav: handleSelectNav,
    onSelectFolder: (folderId: string) => goTo(`/folder/${folderId}`),
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

      <div className="relative flex min-h-0 flex-1">
        <Sidebar {...sidebarProps} className="hidden md:flex" />

        <div
          className={cn(
            'absolute inset-0 z-20 md:hidden',
            sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none',
          )}
          aria-hidden={!sidebarOpen}
        >
          <button
            type="button"
            aria-label="Close sidebar"
            className={cn(
              'absolute inset-0 bg-black/20 transition-opacity',
              sidebarOpen ? 'opacity-100' : 'opacity-0',
            )}
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar
            {...sidebarProps}
            className={cn(
              'absolute inset-y-0 left-0 z-10 shadow-lg transition-transform duration-200 ease-out',
              sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          />
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
