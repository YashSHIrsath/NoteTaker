import { Folder, ListTree, Star } from 'lucide-react'
import { SidebarSection } from './SidebarSection'
import { SidebarFolderItem } from './SidebarFolderItem'
import type { Folder as FolderRecord, SidebarNavId } from '../../types'
import { cn } from '../../lib/cn'

export interface SidebarProps {
  rootFolders: FolderRecord[]
  myNotesExpanded: boolean
  onToggleMyNotes: () => void
  activeNav?: SidebarNavId
  activeFolderId?: string
  onSelectNav: (id: SidebarNavId) => void
  onSelectFolder: (folderId: string) => void
  className?: string
}

export function Sidebar({
  rootFolders,
  myNotesExpanded,
  onToggleMyNotes,
  activeNav,
  activeFolderId,
  onSelectNav,
  onSelectFolder,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-muted)]',
        className,
      )}
    >
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
        <div className="space-y-0.5">
          <SidebarSection
            icon={<ListTree className="h-4 w-4" aria-hidden />}
            label="Tree"
            active={activeNav === 'tree'}
            onSelect={() => onSelectNav('tree')}
          />

          <SidebarSection
            icon={<Folder className="h-4 w-4" aria-hidden />}
            label="MyNotes"
            active={activeNav === 'mynotes'}
            onSelect={() => onSelectNav('mynotes')}
            expandable
            expanded={myNotesExpanded}
            onToggleExpand={onToggleMyNotes}
          >
            {rootFolders.map((folder) => (
              <SidebarFolderItem
                key={folder.id}
                folderId={folder.id}
                parentId={folder.parentId}
                label={folder.name}
                important={folder.isImportant}
                active={activeFolderId === folder.id}
                onClick={() => onSelectFolder(folder.id)}
              />
            ))}
          </SidebarSection>

          <SidebarSection
            icon={<Star className="h-4 w-4" aria-hidden />}
            label="Important"
            active={activeNav === 'important'}
            onSelect={() => onSelectNav('important')}
          />
        </div>
      </nav>
    </aside>
  )
}
