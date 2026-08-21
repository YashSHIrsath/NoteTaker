import { useCallback } from 'react'
import { useFolders } from './useFolders'
import { useDeleteConfirmation } from './useDeleteConfirmation'
import { subtaskDeleteCopy } from '../services/deletion/deleteCopy'

export function useDeleteSubtask() {
  const { requestDelete, dialog } = useDeleteConfirmation()
  const { deleteSubtask, subtasks } = useFolders()

  const requestSubtaskDelete = useCallback(
    (subtaskId: string) => {
      const subtask = subtasks.find((item) => item.id === subtaskId)
      if (!subtask) {
        return
      }
      const copy = subtaskDeleteCopy(subtask, subtasks)
      requestDelete({
        title: copy.title,
        description: copy.description,
        onConfirm: () => deleteSubtask(subtaskId),
      })
    },
    [deleteSubtask, requestDelete, subtasks],
  )

  return { requestSubtaskDelete, dialog }
}
