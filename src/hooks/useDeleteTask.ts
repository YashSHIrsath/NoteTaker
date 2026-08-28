import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFolders } from './useFolders'
import { useDeleteConfirmation } from './useDeleteConfirmation'
import { taskDeleteCopy } from '../services/deletion/deleteCopy'
import { performWithTaskExit } from '../lib/taskExitAnimation'
import { useWorkspacePath } from './useWorkspace'
import { workspaceRelativePath } from '../lib/workspace'

export function useDeleteTask() {
  const { requestDelete, dialog } = useDeleteConfirmation()
  const { deleteTask, getTask } = useFolders()
  const navigate = useNavigate()
  const location = useLocation()
  const to = useWorkspacePath()

  const requestTaskDelete = useCallback(
    (taskId: string) => {
      const task = getTask(taskId)
      if (!task) {
        return
      }
      const copy = taskDeleteCopy(task)
      requestDelete({
        title: copy.title,
        description: copy.description,
        onConfirm: async () => {
          const result = await performWithTaskExit(taskId, () => deleteTask(taskId))
          // Compared workspace-relative: inside a space this pathname is /s/<id>/task/<id>.
          if (workspaceRelativePath(location.pathname) === `/task/${taskId}`) {
            navigate(to(`/folder/${result.folderId}`), { replace: true })
          }
        },
      })
    },
    [deleteTask, getTask, location.pathname, navigate, requestDelete, to],
  )

  return { requestTaskDelete, dialog }
}
