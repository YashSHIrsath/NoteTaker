import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { RenameFolderDialog } from './RenameFolderDialog'
import { useFolders } from '../../hooks/useFolders'
import { useDeleteFolder } from '../../hooks/useDeleteFolder'
import { cn } from '../../lib/cn'

export interface FolderActionsProps {
  folderId: string
  folderName: string
  compact?: boolean
}

export function FolderActions({ folderId, folderName, compact = false }: FolderActionsProps) {
  const { renameFolder } = useFolders()
  const { requestFolderDelete, dialog } = useDeleteFolder()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <IconButton
        label={`Folder actions for ${folderName}`}
        className={cn(compact ? 'h-6 w-6' : 'h-7 w-7')}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setMenuOpen((open) => !open)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </IconButton>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[8.5rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
            onClick={(event) => {
              event.stopPropagation()
              setMenuOpen(false)
              setRenameOpen(true)
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--color-hover)]"
            onClick={(event) => {
              event.stopPropagation()
              setMenuOpen(false)
              requestFolderDelete(folderId)
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
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
