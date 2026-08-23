import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { RenameFolderDialog } from './RenameFolderDialog'
import { useFolders } from '../../hooks/useFolders'
import { useDeleteFolder } from '../../hooks/useDeleteFolder'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import { cn } from '../../lib/cn'

export interface FolderActionsProps {
  folderId: string
  folderName: string
  compact?: boolean
}

const MENU_WIDTH = 160

export function FolderActions({ folderId, folderName, compact = false }: FolderActionsProps) {
  const { renameFolder } = useFolders()
  const { requestFolderDelete, dialog } = useDeleteFolder()
  const [renameOpen, setRenameOpen] = useState(false)
  const menu = useAnchoredPanel<HTMLDivElement>(MENU_WIDTH)

  return (
    <div ref={menu.anchorRef} className="shrink-0">
      <IconButton
        label={`Folder actions for ${folderName}`}
        aria-expanded={menu.open}
        className={cn(compact ? 'h-6 w-6' : 'h-7 w-7')}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          menu.setOpen((open) => !open)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </IconButton>
      {menu.open && menu.position
        ? createPortal(
            <div
              ref={menu.panelRef}
              role="menu"
              aria-label={`Actions for ${folderName}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className="anim-panel-in fixed z-[60] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
              style={{ top: menu.position.top, left: menu.position.left, width: MENU_WIDTH }}
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  menu.setOpen(false)
                  setRenameOpen(true)
                }}
              >
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  menu.setOpen(false)
                  requestFolderDelete(folderId)
                }}
              >
                Delete
              </button>
            </div>,
            document.body,
          )
        : null}
      <RenameFolderDialog
        open={renameOpen}
        name={folderName}
        onClose={() => setRenameOpen(false)}
        onRename={(name) => renameFolder(folderId, name)}
      />
      {dialog}
    </div>
  )
}
