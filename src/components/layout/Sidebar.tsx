import { ClipboardList, Folder, ListTree, LogOut, PanelLeftClose, PanelLeftOpen, Star } from 'lucide-react'
import { ProjectLogo } from '../brand/ProjectLogo'
import { IconButton } from '../ui/IconButton'
import { SidebarSection } from './SidebarSection'
import { SidebarFolderItem } from './SidebarFolderItem'
import type { Folder as FolderRecord, SidebarNavId } from '../../types'
import { NAV_DESTINATIONS, resolveNavOrder } from '../../lib/navOrder'
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
  const { user, signOut } = useAuth()
  const navOrder = resolveNavOrder(user?.user_metadata as Record<string, unknown> | undefined)
  const metadata = (user?.user_metadata ?? {}) as { full_name?: string; avatar_url?: string }
  const displayName = metadata.full_name?.trim() || user?.email || 'Signed in'
  const initial = (metadata.full_name?.trim() || user?.email || 'Y').charAt(0).toUpperCase()

  const handleSignOut = () => {
    void signOut().catch(() => undefined)
  }

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-150',
        collapsed ? 'w-[76px]' : 'w-[264px]',
        className,
      )}
    >
      {/* Brand row, then a rule. Without the rule the wordmark sat directly on top of the first
          nav item with nothing between them, so the whole column read as one undifferentiated
          stack — which is most of why it felt cramped. */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 pb-3.5 pt-4',
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
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)] shadow-[var(--shadow-sm)]"
            aria-hidden
          >
            <ProjectLogo className="h-3.5 w-[19px]" />
          </span>
          {!collapsed ? (
            <span
              className="truncate text-[16px] font-semibold tracking-tight text-[var(--color-text)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Mindstack
            </span>
          ) : null}
        </div>
        {onToggleCollapsed ? (
          // Given a border and a fill of its own: as a bare glyph pushed against the sidebar's
          // right edge it read as part of the frame rather than as something clickable, and it was
          // the one control in here with no hit area you could see before you found it.
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapsed}
            className={cn(
              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
              'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
              'hover:border-[var(--color-border-strong)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25',
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

      <div className="mx-3 border-t border-[var(--color-border)]" />

      <nav className="flex-1 overflow-y-auto px-2.5 pb-3 pt-3" aria-label="Main">
        {/*
          * Drawn in the account's order, the same list the bottom bar and the page transitions
          * read. It was a third hardcoded order before this — Tree, Notes, Tasks, Starred — which
          * agreed with neither of them, so reordering in settings changed the phone's bar and left
          * the desktop sidebar exactly as it was.
          *
          * Notes renders its folders inside itself, which is why these are a map of renderers
          * rather than a list of props: only one of the four has children.
          */}
        <div className="space-y-1">
          {navOrder
            .filter((id): id is SidebarNavId => id !== 'profile')
            .map((id) => {
              if (id === 'mynotes') {
                return (
                  <SidebarSection
                    key={id}
                    icon={<Folder className="h-4 w-4" aria-hidden />}
                    label="Notes"
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
                )
              }
              const icon =
                id === 'tree' ? (
                  <ListTree className="h-4 w-4" aria-hidden />
                ) : id === 'tasks' ? (
                  <ClipboardList className="h-4 w-4" aria-hidden />
                ) : (
                  <Star className="h-4 w-4" aria-hidden />
                )
              return (
                <SidebarSection
                  key={id}
                  icon={icon}
                  label={id === 'important' ? 'Important' : NAV_DESTINATIONS[id].label}
                  active={activeNav === id}
                  onSelect={() => onSelectNav(id)}
                  collapsed={collapsed}
                />
              )
            })}
        </div>
      </nav>

      {/* A bordered footer rather than a pill floating at the bottom of the nav's scroll area: the
          account and its sign out are a different kind of thing from the navigation above them,
          and the rule is what says so. It also gives the sidebar a bottom edge on a tall screen,
          where the nav list ends far above the fold. */}
      <div className="border-t border-[var(--color-border)] px-2.5 py-3">
        {/* One pill holding two controls, not one button holding another — a button inside a
            button is invalid and the inner one never gets its own clicks. */}
        <div
          className={cn(
            'flex items-center rounded-xl p-1 transition-colors',
            profileActive ? 'bg-[var(--color-accent-soft)]' : 'bg-[var(--color-surface-muted)]',
            // Collapsed there's no room beside the avatar, so sign out drops underneath it.
            collapsed ? 'flex-col gap-1' : 'gap-1',
          )}
        >
          <button
            type="button"
            onClick={onOpenProfile}
            aria-current={profileActive ? 'page' : undefined}
            title={collapsed ? displayName : undefined}
            className={cn(
              'flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-colors',
              'hover:bg-[var(--color-hover)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
              collapsed ? 'justify-center' : 'flex-1',
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

          {/* Danger colour on hover, not at rest: it sits one thumb's width from the profile
              button, so it has to identify itself as the destructive one before it's clicked —
              without turning the resting sidebar into a warning. */}
          <IconButton
            label="Sign out"
            onClick={handleSignOut}
            className="h-8 w-8 shrink-0 rounded-lg hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
          >
            <LogOut className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  )
}
