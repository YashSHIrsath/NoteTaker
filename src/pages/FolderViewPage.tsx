import { Navigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/common/EmptyState'
import { FolderView } from '../components/folder/FolderView'
import { useFolders } from '../hooks/useFolders'

export function FolderViewPage() {
  const { folderId } = useParams<{ folderId: string }>()
  const { getFolder, getPath, getChildFolders, getTasksInFolder, createFolder, createTask } = useFolders()

  if (!folderId) {
    return <Navigate to="/" replace />
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
      onCreateFolder={(name) => {
        createFolder(name, folder.id)
      }}
      onCreateTask={(title) => createTask(title, folder.id)}
    />
  )
}
