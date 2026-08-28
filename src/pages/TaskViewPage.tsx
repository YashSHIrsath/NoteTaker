import { Navigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/common/EmptyState'
import { TaskEditor } from '../components/task/TaskEditor'
import { useFolders } from '../hooks/useFolders'
import { useWorkspacePath } from '../hooks/useWorkspace'

export function TaskViewPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const { getTask, getFolder, getPath } = useFolders()
  const to = useWorkspacePath()

  if (!taskId) {
    return <Navigate to={to('/')} replace />
  }

  const task = getTask(taskId)

  if (!task) {
    return (
      <EmptyState
        title="Task not found"
        description="This task is no longer available."
      />
    )
  }

  const parentFolder = getFolder(task.folderId)

  if (!parentFolder) {
    return (
      <EmptyState
        title="Folder not found"
        description="This task's folder is no longer available."
      />
    )
  }

  return (
    // Clearance for the floating bottom bar below lg — the dialog form of this editor doesn't
    // need it, since a dialog covers the bar entirely.
    <div className="h-full pb-24 lg:pb-0">
      <TaskEditor task={task} folderPath={getPath(parentFolder.id)} />
    </div>
  )
}
