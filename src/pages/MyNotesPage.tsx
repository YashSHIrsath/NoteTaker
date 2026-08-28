import { useState } from 'react'
import { Folder, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { CreateFolderDialog } from '../components/folder/CreateFolderDialog'
import { RootFolderList } from '../components/folder/RootFolderList'
import { useFolders } from '../hooks/useFolders'
import { useWorkspacePath } from '../hooks/useWorkspace'
import { getRootFolders } from '../lib/folders'
import { cn } from '../lib/cn'
import {
  COLLAPSIBLE_TITLE_CLASS,
  FLOATING_HEADER_CLASS,
  useFloatingHeader,
} from '../hooks/useFloatingHeader'

export function MyNotesPage() {
  const navigate = useNavigate()
  const to = useWorkspacePath()
  const { folders, tasks, createFolder } = useFolders()
  const rootFolders = getRootFolders(folders)
  const [createOpen, setCreateOpen] = useState(false)
  const { headerRef, contentRef, condensed } = useFloatingHeader()

  const newFolderButton = (
    <Button variant="subtle" size="sm" className="h-8 shrink-0 sm:h-9" onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      New Folder
    </Button>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={headerRef} className={FLOATING_HEADER_CLASS}>
        {/* Only the title half collapses on scroll — the same rule as the Tasks page, and for the
            same reason it is written down there. This page used to wrap the whole row, New Folder
            included, so scrolling emptied the bar completely and left a blank card hovering over
            the folders with the page's one action inside it. A bar that overlays content has to
            keep earning its height; a button does, a title you have read doesn't. */}
        <div className="flex w-full items-center gap-2 sm:gap-3">
          <div
            className={cn(
              COLLAPSIBLE_TITLE_CLASS,
              'min-w-0',
              // Cancels the row gap as the title reaches zero width, so the button ends up against
              // the bar's own padding rather than a gap short of it.
              condensed ? 'max-h-0 -mr-2 opacity-0 sm:-mr-3' : 'max-h-16 opacity-100',
            )}
            style={{ flexGrow: condensed ? 0 : 1, flexBasis: 0 }}
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] sm:h-9 sm:w-9">
                <Folder className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h1
                  className="truncate text-[17px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[20px]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Notes
                </h1>
                {/* A count, not a slogan. The strapline needed more width than a phone's header
                    row has left after the title and the button, so what it actually rendered was
                    "Keep your folders, ideas, a…" — half a sentence, saying nothing. This fits,
                    and it says something the page itself can't. */}
                <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-text-muted)] sm:text-[12.5px]">
                  {folders.length} {folders.length === 1 ? 'folder' : 'folders'} · {tasks.length}{' '}
                  {tasks.length === 1 ? 'note' : 'notes'}
                </p>
              </div>
            </div>
          </div>
          {newFolderButton}
        </div>
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
              onOpenFolder={(folderId) => navigate(to(`/folder/${folderId}`))}
              onCreateFolder={() => setCreateOpen(true)}
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
