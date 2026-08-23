import { useState } from 'react'
import { ChevronUp, Plus } from 'lucide-react'
import type { Folder, FolderNode } from '../../types'
import { Button } from '../ui/Button'
import { FolderItem } from './FolderItem'
import { FolderTree } from '../tree/FolderTree'
import { cn } from '../../lib/cn'
import { getRootCategoryForFolder } from '../../lib/folderColor'
import { useFolders } from '../../hooks/useFolders'

export interface FolderSidePanelProps {
  folders: Folder[]
  currentFolderId: string
  forest: FolderNode[]
  locationPathIds: ReadonlySet<string>
  onSelectFolder: (folderId: string) => void
  onCreateFolder: () => void
  className?: string
  /** 'sidebar' is the desktop column; the compact variants are bounded floating panels. */
  variant?: 'sidebar' | 'sheet' | 'popover'
}

export function FolderSidePanel({
  folders,
  currentFolderId,
  forest,
  locationPathIds,
  onSelectFolder,
  onCreateFolder,
  className,
  variant = 'sidebar',
}: FolderSidePanelProps) {
  const [locationOpen, setLocationOpen] = useState(false)
  const { folders: allFolders } = useFolders()
  const isSheet = variant === 'sheet'
  const isFloating = isSheet || variant === 'popover'

  return (
    <aside
      className={cn(
        'flex flex-col',
        isFloating
          ? [
              // Bound the floating panel to the visual viewport so both its list and location
              // control remain reachable on a short screen.
              'max-h-[min(60dvh,30rem)] w-full overflow-hidden',
              isSheet ? 'rounded-3xl' : 'rounded-2xl',
              // Shares the app's floating-surface treatment in either compact presentation.
              'border border-[var(--color-border)]/70 bg-[var(--color-surface)]/80 backdrop-blur-xl',
              'shadow-[var(--shadow-lg)]',
              'supports-[backdrop-filter:blur(0px)]:bg-[var(--color-surface)]/70',
            ].join(' ')
          : 'h-full w-[240px] shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface-muted)]',
        className,
      )}
    >
      {isSheet ? (
        <div className="flex shrink-0 items-center justify-center pt-2">
          <span className="h-1 w-9 rounded-full bg-[var(--color-border-strong)]" aria-hidden />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <h2 className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Folders
          </h2>
          <Button variant="subtle" size="sm" onClick={onCreateFolder}>
            <Plus className="h-4 w-4" aria-hidden />
            New
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {folders.length === 0 ? (
            <p className="px-2.5 text-sm text-[var(--color-text-muted)]">No folders</p>
          ) : (
            <ul className="space-y-0.5">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <FolderItem
                    folderId={folder.id}
                    parentId={folder.parentId}
                    name={folder.name}
                    important={folder.isImportant}
                    category={getRootCategoryForFolder(allFolders, folder.id)}
                    onClick={() => onSelectFolder(folder.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className={cn(
          'shrink-0 border-t border-[var(--color-border)]',
          locationOpen && 'flex h-[40%] max-h-[40%] min-h-0 flex-col',
        )}
      >
        <button
          type="button"
          aria-expanded={locationOpen}
          onClick={() => setLocationOpen((open) => !open)}
          className={cn(
            'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium',
            'uppercase tracking-wide text-[var(--color-text-muted)]',
            'hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/20',
          )}
        >
          <span>Know where you are</span>
          <ChevronUp
            className={cn('h-4 w-4 shrink-0 transition-transform', !locationOpen && 'rotate-180')}
            aria-hidden
          />
        </button>

        {locationOpen ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            <FolderTree
              folders={forest}
              selectedId={currentFolderId}
              expandedIds={locationPathIds}
              compact
              interactive={false}
            />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
