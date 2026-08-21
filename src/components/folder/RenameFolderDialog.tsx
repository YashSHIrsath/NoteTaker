import { FolderNameDialog } from './FolderNameDialog'

export interface RenameFolderDialogProps {
  open: boolean
  name: string
  onClose: () => void
  onRename: (name: string) => void | Promise<unknown>
}

export function RenameFolderDialog({
  open,
  name,
  onClose,
  onRename,
}: RenameFolderDialogProps) {
  return (
    <FolderNameDialog
      open={open}
      title="Rename folder"
      confirmLabel="Save"
      busyLabel="Saving…"
      initialName={name}
      onClose={onClose}
      onSubmit={onRename}
    />
  )
}
