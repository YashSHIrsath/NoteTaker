import { FolderProvider } from '../context/FolderContext'
import { Outlet } from 'react-router-dom'

export function AuthenticatedApp() {
  return (
    <div className="h-full">
      <FolderProvider>
        <Outlet />
      </FolderProvider>
    </div>
  )
}
