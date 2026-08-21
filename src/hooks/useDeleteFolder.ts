import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFolders } from './useFolders'
import { useDeleteConfirmation } from './useDeleteConfirmation'
import { folderDeleteCopy } from '../services/deletion/deleteCopy'

export function useDeleteFolder() {
  const { requestDelete, dialog } = useDeleteConfirmation()
  const { deleteFolder, folders, tasks, getFolder } = useFolders()
  const navigate = useNavigate()
  const location = useLocation()

  const requestFolderDelete = useCallback(
    (folderId: string) => {
      const folder = getFolder(folderId)
      if (!folder) {
        return
      }
      const copy = folderDeleteCopy(folder, folders, tasks)
      requestDelete({
        title: copy.title,
        description: copy.description,
        onConfirm: async () => {
          const result = await deleteFolder(folderId)
          const folderMatch = /^\/folder\/([^/]+)/.exec(location.pathname)
          const taskMatch = /^\/task\/([^/]+)/.exec(location.pathname)
          if (folderMatch && result.deletedFolderIds.includes(folderMatch[1] ?? '')) {
            navigate(result.parentId ? `/folder/${result.parentId}` : '/mynotes', { replace: true })
            return
          }
          if (taskMatch && result.deletedTaskIds.includes(taskMatch[1] ?? '')) {
            navigate(result.parentId ? `/folder/${result.parentId}` : '/mynotes', { replace: true })
          }
        },
      })
    },
    [deleteFolder, folders, getFolder, location.pathname, navigate, requestDelete, tasks],
  )

  return { requestFolderDelete, dialog }
}
