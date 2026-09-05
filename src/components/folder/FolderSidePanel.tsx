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
  /**
   * Open to begin with, and open again on the next load whatever you did to it last time.
   *
   * Deliberately not remembered. This is the panel's answer to "where am I", which is the question
   * you have when you *arrive* — so it is worth its space by default, and closing it is a "not just
   * now" rather than a setting. Held in local state rather than in uiState for exactly that reason:
   * a reload is a fresh arrival.
   */
  const [locationOpen, setLocationOpen] = useState(true)
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
              'max-h-[min(60dvh,30rem)] overflow-hidden',
              // No width of its own as a sheet: the caller pins it between left and right insets,
              // and `w-full` there is 100% of the *containing block* — the full-viewport overlay —
              // not of the space between those insets. The two fight, width wins, and the sheet
              // ends up viewport-wide but pushed right by the left inset, so it hung off the right
              // edge of every screen narrower than the 28rem cap: 12px of it, taking the "New"
              // button with it. The popover variant is placed by an anchor rather than by insets,
              // so there `w-full` is what fills it.
              isSheet ? '' : 'w-full',
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
            <ul className="space-y-0">
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

      {/*
        * Height is an explicit two-row grid track, not a flex `h-[40%]` swap, so this can
        * transition between "just the button" and "up to 40% of the panel" without ever needing
        * to know the button's own height as a number: `auto` sizes that row to whatever it needs
        * in both states, and only the second row's fraction (0fr closed, 1fr open) has to move.
        * Same reasoning as `.anim-collapse` in index.css, just with a fixed header row that a
        * single collapsing track doesn't have room for — so it's inlined here instead of forcing
        * a two-row shape onto a utility built for one-row content.
        *
        * The tree stays mounted (rather than conditionally rendered) at every state: it's a plain,
        * non-interactive display (`interactive={false}`), so there's nothing to clean up by
        * unmounting it, and it means the collapse is pure CSS with no mount/unmount timing to get
        * right.
        */}
      <div
        className={cn(
          'grid max-h-[40%] shrink-0 grid-rows-[auto_0fr] border-t border-[var(--color-border)]',
          'transition-[grid-template-rows] duration-[var(--motion-slow)]',
          '[transition-timing-function:var(--motion-ease)] motion-reduce:transition-none',
          locationOpen && 'grid-rows-[auto_1fr]',
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

        <div className="min-h-0 overflow-hidden">
          <div className="h-full overflow-y-auto px-2 pb-3">
            <FolderTree
              folders={forest}
              selectedId={currentFolderId}
              expandedIds={locationPathIds}
              compact
              interactive={false}
            />
          </div>
        </div>
      </div>
    </aside>
  )
}
