import { Navigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/common/EmptyState'
import { FolderView } from '../components/folder/FolderView'
import { useFolders } from '../hooks/useFolders'
import { useWorkspacePath } from '../hooks/useWorkspace'

export function FolderViewPage() {
  const { folderId } = useParams<{ folderId: string }>()
  const { getFolder, getPath, getChildFolders, getTasksInFolder, createFolder, createTask } = useFolders()
  const to = useWorkspacePath()

  if (!folderId) {
    return <Navigate to={to('/')} replace />
  }

  const folder = getFolder(folderId)

  if (!folder) {
    return (
      <EmptyState
        title="Folder not found"
        description="This folder is no longer available."
      />
    )
  }

  return (
    <FolderView
      folder={folder}
      path={getPath(folder.id)}
      childFolders={getChildFolders(folder.id)}
      tasks={getTasksInFolder(folder.id)}
      // Returned, not fired and forgotten. The dialog keys "did that work" off this promise, so
      // dropping it closed the dialog on a write that was about to be rejected and rolled back —
      // the folder appeared, vanished a moment later, and the only trace was an unhandled
      // rejection in the console.
      onCreateFolder={(name, visibility) => createFolder(name, folder.id, visibility)}
      onCreateTask={(title) => createTask(title, folder.id)}
    />
  )
}
