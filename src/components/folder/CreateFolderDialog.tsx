import type { ContentVisibility } from '../../types'
import { FolderNameDialog } from './FolderNameDialog'
import { useIsSpace } from '../../hooks/useWorkspace'

export interface CreateFolderDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, visibility?: ContentVisibility) => void | Promise<unknown>
}

export function CreateFolderDialog({ open, onClose, onCreate }: CreateFolderDialogProps) {
  // Personal notes have one reader, so there is nothing to ask and nothing to show.
  const isSpace = useIsSpace()
  return (
    <FolderNameDialog
      open={open}
      title="New folder"
      confirmLabel="Create"
      busyLabel="Creating…"
      withVisibility={isSpace}
      onClose={onClose}
      onSubmit={onCreate}
    />
  )
}
