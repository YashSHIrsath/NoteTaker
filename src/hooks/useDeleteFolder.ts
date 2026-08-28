import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFolders } from './useFolders'
import { useDeleteConfirmation } from './useDeleteConfirmation'
import { folderDeleteCopy } from '../services/deletion/deleteCopy'
import { useWorkspacePath } from './useWorkspace'
import { workspaceRelativePath } from '../lib/workspace'

export function useDeleteFolder() {
  const { requestDelete, dialog } = useDeleteConfirmation()
  const { deleteFolder, folders, tasks, getFolder } = useFolders()
  const navigate = useNavigate()
  const location = useLocation()
  const to = useWorkspacePath()

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
          // Matched workspace-relative, so a space's /s/<id>/folder/<id> is recognised too.
          const here = workspaceRelativePath(location.pathname)
          const folderMatch = /^\/folder\/([^/]+)/.exec(here)
          const taskMatch = /^\/task\/([^/]+)/.exec(here)
          if (folderMatch && result.deletedFolderIds.includes(folderMatch[1] ?? '')) {
            navigate(to(result.parentId ? `/folder/${result.parentId}` : '/mynotes'), { replace: true })
            return
          }
          if (taskMatch && result.deletedTaskIds.includes(taskMatch[1] ?? '')) {
            navigate(to(result.parentId ? `/folder/${result.parentId}` : '/mynotes'), { replace: true })
          }
        },
      })
    },
    [deleteFolder, folders, getFolder, location.pathname, navigate, requestDelete, tasks, to],
  )

  return { requestFolderDelete, dialog }
}
