import { FolderNameDialog } from './FolderNameDialog'

export interface CreateFolderDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void | Promise<unknown>
}

export function CreateFolderDialog({ open, onClose, onCreate }: CreateFolderDialogProps) {
  return (
    <FolderNameDialog
      open={open}
      title="New folder"
      confirmLabel="Create"
      busyLabel="Creating…"
      onClose={onClose}
      onSubmit={onCreate}
    />
  )
}
