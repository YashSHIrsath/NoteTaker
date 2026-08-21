import { createElement, useCallback, useMemo, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

export interface DeleteConfirmationRequest {
  title: string
  description: string
  onConfirm: () => Promise<void>
}

export function useDeleteConfirmation(): {
  requestDelete: (request: DeleteConfirmationRequest) => void
  dialog: ReactNode
} {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [request, setRequest] = useState<DeleteConfirmationRequest | null>(null)

  const requestDelete = useCallback((next: DeleteConfirmationRequest) => {
    if (loading) {
      return
    }
    setRequest(next)
    setOpen(true)
  }, [loading])

  const handleCancel = useCallback(() => {
    if (loading) {
      return
    }
    setOpen(false)
    setRequest(null)
  }, [loading])

  const handleConfirm = useCallback(() => {
    if (!request || loading) {
      return
    }
    setLoading(true)
    void request
      .onConfirm()
      .then(() => {
        setOpen(false)
        setRequest(null)
      })
      .catch(() => {
        setOpen(false)
        setRequest(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [loading, request])

  const dialog = useMemo(
    () =>
      createElement(ConfirmDialog, {
        open,
        title: request?.title ?? '',
        description: request?.description ?? '',
        loading,
        onCancel: handleCancel,
        onConfirm: handleConfirm,
      }),
    [handleCancel, handleConfirm, loading, open, request],
  )

  return { requestDelete, dialog }
}
