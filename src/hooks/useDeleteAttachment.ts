import { useCallback } from 'react'
import { useFolders } from './useFolders'
import { useDeleteConfirmation } from './useDeleteConfirmation'
import { attachmentDeleteCopy } from '../services/deletion/deleteCopy'

export function useDeleteAttachment() {
  const { requestDelete, dialog } = useDeleteConfirmation()
  const { deleteAttachment } = useFolders()

  const requestAttachmentDelete = useCallback(
    (attachmentId: string, name: string) => {
      const copy = attachmentDeleteCopy(name)
      requestDelete({
        title: copy.title,
        description: copy.description,
        onConfirm: () => deleteAttachment(attachmentId),
      })
    },
    [deleteAttachment, requestDelete],
  )

  return { requestAttachmentDelete, dialog }
}
