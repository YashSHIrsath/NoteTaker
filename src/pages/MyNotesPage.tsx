import { useState } from 'react'
import { Folder, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { CreateFolderDialog } from '../components/folder/CreateFolderDialog'
import { RootFolderList } from '../components/folder/RootFolderList'
import { useFolders } from '../hooks/useFolders'
import { getRootFolders } from '../lib/folders'
import { cn } from '../lib/cn'
import {
  COLLAPSIBLE_TITLE_CLASS,
  FLOATING_HEADER_CLASS,
  useFloatingHeader,
} from '../hooks/useFloatingHeader'

export function MyNotesPage() {
  const navigate = useNavigate()
  const { folders, createFolder } = useFolders()
  const rootFolders = getRootFolders(folders)
  const [createOpen, setCreateOpen] = useState(false)
  const { headerRef, contentRef, condensed } = useFloatingHeader()

  const newFolderButton = (
    <Button variant="subtle" size="sm" onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      New Folder
    </Button>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={headerRef} className={FLOATING_HEADER_CLASS}>
        {/* Full header at the top of the page, controls only once it's scrolled — a bar that
            overlays the content shouldn't keep spending its height on a title you've read. */}
        <div
          className={cn(
            COLLAPSIBLE_TITLE_CLASS,
            condensed ? 'max-h-0 opacity-0' : 'mb-2 max-h-14 opacity-100',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] sm:h-9 sm:w-9">
              <Folder className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1
                className="truncate text-[17px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[20px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                MyNotes
              </h1>
              <p className="text-[11.5px] text-[var(--color-text-muted)] sm:text-[12.5px]">
                {rootFolders.length} {rootFolders.length === 1 ? 'folder' : 'folders'}
              </p>
            </div>
          </div>
        </div>

        {/* The row that survives scrolling. */}
        <div className="flex items-center justify-end gap-3">{newFolderButton}</div>
      </div>

      <div
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 sm:px-6 lg:pb-5"
      >

        {rootFolders.length === 0 ? (
          <div className="mt-16 flex flex-col items-center px-6 text-center">
            <p className="text-lg font-medium text-[var(--color-text)]">No folders yet.</p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Create your first folder.</p>
            <div className="mt-4">{newFolderButton}</div>
          </div>
        ) : (
          <div className="mt-4 lg:mt-6">
            <RootFolderList
              folders={rootFolders}
              onOpenFolder={(folderId) => navigate(`/folder/${folderId}`)}
            />
          </div>
        )}
      </div>

      <CreateFolderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(name) => createFolder(name, null)}
      />
    </div>
  )
}
