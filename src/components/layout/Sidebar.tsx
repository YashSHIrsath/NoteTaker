import { ClipboardList, Folder, Home, ListTree, LogOut, PanelLeftClose, PanelLeftOpen, Star, Users } from 'lucide-react'
import { ProjectLogo } from '../brand/ProjectLogo'
import { IconButton } from '../ui/IconButton'
import { SidebarSection } from './SidebarSection'
import { SidebarFolderItem } from './SidebarFolderItem'
import { SidebarWorkspaceItem } from './SidebarWorkspaceItem'
import type { Folder as FolderRecord, SidebarNavId } from '../../types'
import { NAV_DESTINATIONS } from '../../lib/navOrder'
import { useDisplaySettings } from '../../hooks/useDisplaySettings'
import { cn } from '../../lib/cn'
import { useAuth } from '../../hooks/useAuth'
import { getFolderCategory } from '../../lib/folderColor'
import { WorkspaceSwitcher } from '../space/WorkspaceSwitcher'
import { SpaceAvatar } from '../space/SpaceAvatar'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useSpaces } from '../../hooks/useSpaces'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

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

const SPACES_EXPANDED_KEY = 'mynotes-sidebar-spaces-expanded'

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
  /**
   * Which workspace this sidebar is showing.
   *
   * The brand row is where it belongs: it is the first thing read in the column, and inside a shared
   * space the whole column below it is somebody else's content. The account row at the bottom used to
   * say "Personal workspace" as a literal, which was true right up until spaces existed.
   */
  const workspace = useWorkspace()
  const { owned, joined, invites, getSpace } = useSpaces()
  const navigate = useNavigate()
  const spaces = [...owned, ...joined]

  /**
   * Whether the Spaces row is showing its workspaces.
   *
   * Open by default inside a space, because that is exactly when "how do I get out of here" is the
   * question — and the first entry in the list is the way out. Remembered per device, the same way
   * the sidebar's own collapsed state is.
   */
  const [spacesExpanded, setSpacesExpanded] = useState(() => {
    const stored = window.localStorage.getItem(SPACES_EXPANDED_KEY)
    return stored === null ? workspace.kind === 'space' : stored === '1'
  })
  const toggleSpaces = () => {
    setSpacesExpanded((current) => {
      const next = !current
      window.localStorage.setItem(SPACES_EXPANDED_KEY, next ? '1' : '0')
      return next
    })
  }
  const currentSpace = workspace.kind === 'space' ? getSpace(workspace.id) : undefined
  const workspaceLabel =
    workspace.kind === 'space' ? currentSpace?.name ?? 'Shared space' : 'Personal workspace'
  const { navOrder } = useDisplaySettings()
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
            collapsed && 'justify-center',
          )}
        >
          {/*
            * The mark, and only while there is room for it.
            *
            * Collapsed, this row had two 32px boxes and a 10px gap to fit into 52px — a 76px rail
            * less its px-3 — so the workspace button was pushed out through the sidebar's own right
            * edge. Which of the two to drop is not a close call: the header sits directly above this
            * and already shows the mark *and* the wordmark, so at this width the logo was the second
            * copy of something 40px away, while the workspace button is the only thing saying whose
            * notes these are.
            */}
          {collapsed ? null : (
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)] shadow-[var(--shadow-sm)]"
              aria-hidden
            >
              <ProjectLogo className="h-3.5 w-[19px]" />
            </span>
          )}
          <WorkspaceSwitcher collapsed={collapsed} className={collapsed ? undefined : 'flex-1'} />
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

          {/*
            * Spaces, always last and never reorderable.
            *
            * It was drawn from the same order as everything above, which put a sixth entry in the
            * reorder list that moved nothing anybody could see: the bottom bar filtered it out, and
            * dragging it here only decided where this one row sat. A list of workspaces is not one
            * of the places you work, so it sits below the pages rather than among them, and the
            * order is now the five things it actually orders.
            *
            * The row goes to the spaces page; the chevron opens the spaces themselves. Two controls,
            * two jobs, and neither pretends to be the other — the row was briefly a pure toggle,
            * which left the page it names reachable only through an entry buried in its own list.
            */}
          <SidebarSection
            icon={<Users className="h-4 w-4" aria-hidden />}
            label="Spaces"
            active={activeNav === 'spaces'}
            /* Somebody has asked you to join something and is waiting on an answer. It belongs on
               the row rather than only on the page, because the page is where you would otherwise
               have to go to find out. */
            badge={invites.length}
            onSelect={() => onSelectNav('spaces')}
            expandable
            expanded={spacesExpanded && !collapsed}
            onToggleExpand={toggleSpaces}
            collapsed={collapsed}
          >
            {spaces.length === 0 ? (
              /* Not a control — an empty dropdown with no explanation reads as broken. The way to
                 make one is the row above, which is where it belongs. */
              <p className="px-2 py-1.5 text-[12px] text-[var(--color-text-muted)]">No spaces yet</p>
            ) : (
              spaces.map((space) => (
                <SidebarWorkspaceItem
                  key={space.id}
                  space={space}
                  active={workspace.kind === 'space' && workspace.id === space.id}
                  onClick={() => navigate(`/s/${space.id}`)}
                />
              ))
            )}
          </SidebarSection>
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
          {/*
            * Inside a space this row is the space, not you.
            *
            * The column above it is somebody else's content, and a footer showing your own face and
            * name read as though the whole sidebar were yours. So the space gets its own mark — its
            * colour, which is the same identity carried through the rest of the app — its name, and
            * how many people are in it. Your own account is the small avatar to the right.
            */}
          <button
            type="button"
            /*
             * The space's own screen, not a popup over the notes.
             *
             * This used to open a dialog on a wide screen while a phone got the whole page — two
             * presentations of the same thing, and the popup was the worse one: it held the space's
             * identity, its note and every member's role inside a box floating over the notes it
             * was describing. The page is workspace-scoped, so this is the same press in both
             * places and there is only one layout to keep right.
             */
            onClick={onOpenProfile}
            aria-current={!currentSpace && profileActive ? 'page' : undefined}
            title={collapsed ? (currentSpace ? currentSpace.name : displayName) : undefined}
            className={cn(
              'flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left transition-colors',
              'hover:bg-[var(--color-hover)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
              collapsed ? 'justify-center' : 'flex-1',
            )}
          >
            {currentSpace ? (
              <SpaceAvatar
                spaceId={currentSpace.id}
                color={currentSpace.color}
                imageUrl={currentSpace.imageUrl}
                className="h-7 w-7"
              />
            ) : metadata.avatar_url ? (
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
                  {currentSpace ? currentSpace.name : displayName}
                </div>
                <div className="truncate text-[11px] text-[var(--color-text-muted)]">
                  {currentSpace
                    ? currentSpace.memberCount === 1
                      ? 'Just you so far'
                      : `${currentSpace.memberCount} people`
                    : workspaceLabel}
                </div>
              </div>
            ) : null}
          </button>

          {/*
            * The way out, where the space you are in is named — not an entry inside a list you have
            * to open first.
            *
            * This slot used to hold your own face and a sign out, beside a row that belonged to the
            * space. Two accounts in one pill, and the destructive control of the pair was the one
            * you did not come here for. Inside a space the only thing wanted from this corner is
            * back, so that is all it offers; it lands on your profile, which is where signing out
            * lives.
            */}
          {currentSpace ? (
            <IconButton
              label="Leave this space and go to your account"
              onClick={() => navigate('/profile')}
              box="compact"
              className="shrink-0 rounded-lg"
            >
              <Home className="h-4 w-4" />
            </IconButton>
          ) : (
            /* Danger colour on hover, not at rest: it sits one thumb's width from the profile
               button, so it has to identify itself as the destructive one before it's clicked —
               without turning the resting sidebar into a warning. */
            <IconButton
              label="Sign out"
              onClick={handleSignOut}
              box="compact"
              className="shrink-0 rounded-lg hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
            >
              <LogOut className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>

    </aside>
  )
}
