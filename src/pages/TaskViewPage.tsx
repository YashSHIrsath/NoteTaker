import { Navigate, useParams } from 'react-router-dom'
import { EmptyState } from '../components/common/EmptyState'
import { TaskEditor } from '../components/task/TaskEditor'
import { useFolders } from '../hooks/useFolders'

export function TaskViewPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const { getTask, getFolder, getPath } = useFolders()

  if (!taskId) {
    return <Navigate to="/" replace />
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

  return <TaskEditor task={task} folderPath={getPath(parentFolder.id)} />
}
