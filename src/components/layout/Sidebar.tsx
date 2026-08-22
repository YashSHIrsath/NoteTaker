import { ClipboardList, Folder, ListTree, PanelLeftClose, PanelLeftOpen, Star } from 'lucide-react'
import { SidebarSection } from './SidebarSection'
import { SidebarFolderItem } from './SidebarFolderItem'
import type { Folder as FolderRecord, SidebarNavId } from '../../types'
import { cn } from '../../lib/cn'
import { useAuth } from '../../hooks/useAuth'
import { getFolderCategory } from '../../lib/folderColor'

export interface SidebarProps {
  rootFolders: FolderRecord[]
  myNotesExpanded: boolean
  onToggleMyNotes: () => void
  activeNav?: SidebarNavId
  activeFolderId?: string
  onSelectNav: (id: SidebarNavId) => void
  onSelectFolder: (folderId: string) => void
  onOpenProfile: () => void
  profileActive?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
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
  onOpenProfile,
  profileActive = false,
  collapsed = false,
  onToggleCollapsed,
  className,
}: SidebarProps) {
  const { user } = useAuth()
  const metadata = (user?.user_metadata ?? {}) as { full_name?: string; avatar_url?: string }
  const displayName = metadata.full_name?.trim() || user?.email || 'Signed in'
  const initial = (metadata.full_name?.trim() || user?.email || 'Y').charAt(0).toUpperCase()

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-150',
        collapsed ? 'w-[76px]' : 'w-[264px]',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-3 pb-4 pt-4',
          collapsed && 'flex-col gap-3',
        )}
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5',
            collapsed && 'flex-1 justify-center',
          )}
        >
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white shadow-[var(--shadow-sm)]"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent), var(--cat-rose))',
              fontFamily: 'var(--font-display)',
            }}
            aria-hidden
          >
            M
          </span>
          {!collapsed ? (
            <span
              className="truncate text-[16px] font-semibold tracking-tight text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              MyNotes
            </span>
          ) : null}
        </div>
        {onToggleCollapsed ? (
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapsed}
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors',
              'hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Main">
        <div className="space-y-0.5">
          <SidebarSection
            icon={<ListTree className="h-4 w-4" aria-hidden />}
            label="Tree"
            active={activeNav === 'tree'}
            onSelect={() => onSelectNav('tree')}
            collapsed={collapsed}
          />

          <SidebarSection
            icon={<Folder className="h-4 w-4" aria-hidden />}
            label="MyNotes"
            active={activeNav === 'mynotes'}
            onSelect={() => onSelectNav('mynotes')}
            expandable
            expanded={myNotesExpanded && !collapsed}
            onToggleExpand={onToggleMyNotes}
            collapsed={collapsed}
          >
            {rootFolders.map((folder, index) => (
              <SidebarFolderItem
                key={folder.id}
                folderId={folder.id}
                parentId={folder.parentId}
                label={folder.name}
                important={folder.isImportant}
                category={getFolderCategory(index)}
                active={activeFolderId === folder.id}
                onClick={() => onSelectFolder(folder.id)}
              />
            ))}
          </SidebarSection>

          <SidebarSection
            icon={<ClipboardList className="h-4 w-4" aria-hidden />}
            label="Tasks"
            active={activeNav === 'tasks'}
            onSelect={() => onSelectNav('tasks')}
            collapsed={collapsed}
          />

          <SidebarSection
            icon={<Star className="h-4 w-4" aria-hidden />}
            label="Important"
            active={activeNav === 'important'}
            onSelect={() => onSelectNav('important')}
            collapsed={collapsed}
          />
        </div>
      </nav>

      <div className="px-2 pb-3">
        <button
          type="button"
          onClick={onOpenProfile}
          aria-current={profileActive ? 'page' : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-full p-2 text-left transition-colors',
            'hover:bg-[var(--color-hover)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
            profileActive ? 'bg-[var(--color-accent-soft)]' : 'bg-[var(--color-surface-muted)]',
            collapsed && 'justify-center',
          )}
        >
          {metadata.avatar_url ? (
            <img
              src={metadata.avatar_url}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))' }}
              aria-hidden
            >
              {initial}
            </span>
          )}
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium text-[var(--color-text)]">
                {displayName}
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)]">Personal workspace</div>
            </div>
          ) : null}
        </button>
      </div>
    </aside>
  )
}
