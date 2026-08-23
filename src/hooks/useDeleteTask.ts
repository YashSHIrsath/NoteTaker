import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFolders } from './useFolders'
import { useDeleteConfirmation } from './useDeleteConfirmation'
import { taskDeleteCopy } from '../services/deletion/deleteCopy'
import { performWithTaskExit } from '../lib/taskExitAnimation'

export function useDeleteTask() {
  const { requestDelete, dialog } = useDeleteConfirmation()
  const { deleteTask, getTask } = useFolders()
  const navigate = useNavigate()
  const location = useLocation()

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
          if (location.pathname === `/task/${taskId}`) {
            navigate(`/folder/${result.folderId}`, { replace: true })
          }
        },
      })
    },
    [deleteTask, getTask, location.pathname, navigate, requestDelete],
  )

  return { requestTaskDelete, dialog }
}
