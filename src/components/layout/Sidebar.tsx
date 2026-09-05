import { ChevronsLeft, ChevronsRight, ClipboardList, Folder, Home, ListTree, LogOut, Star, Users } from 'lucide-react'
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
import { useState, type ReactNode } from 'react'
import { ISLAND_CLASS, ISLAND_GAP } from '../../lib/island'

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

/**
 * One card in the sidebar's stack.
 *
 * The sidebar is not an island — it is a column of them: the brand, each navigation group, the
 * account, sitting straight on the shell's ground with the same gap between them as between the
 * shell's own islands. The rules that used to divide these groups are gone, because the gap says
 * what they said, and says it without drawing a line down a column that is already narrow.
 *
 * The padding is the point of the wrapper rather than an afterthought: without it an active row's
 * tinted fill reaches the card's own edges and the two read as one shape, so the row stops looking
 * like a row *inside* anything. And `shrink-0` because the nav scrolls — flex children would
 * otherwise give up height to avoid overflowing, instead of letting it scroll.
 */
function SidebarIsland({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('shrink-0 p-1.5', ISLAND_CLASS, className)}>{children}</div>
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
        // Transparent, and with no edge of its own: the pieces below carry the surface now, and a
        // border here would draw a box around a column of boxes.
        'flex h-full shrink-0 flex-col transition-[width] duration-150',
        ISLAND_GAP,
        collapsed ? 'w-[76px]' : 'w-[264px]',
        className,
      )}
    >
      {/* The brand row, on a card of its own. It used to be a row with a rule under it, which was
          there because without something between it and the first nav item the whole column read
          as one undifferentiated stack. The gap does that job now, in every direction at once. */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-2.5 px-3 py-3',
          collapsed && 'flex-col gap-3',
          ISLAND_CLASS,
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
            {/* Points the direction the sidebar is about to move — right to open, left to
                close — rather than a static panel glyph that looks the same regardless of which
                way the click goes. */}
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronsLeft className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      <nav className={cn('flex flex-1 flex-col overflow-y-auto no-scrollbar', ISLAND_GAP)} aria-label="Main">
        {/*
          * Drawn in the account's order, the same list the bottom bar and the page transitions
          * read. It was a third hardcoded order before this — Tree, Notes, Tasks, Starred — which
          * agreed with neither of them, so reordering in settings changed the phone's bar and left
          * the desktop sidebar exactly as it was.
          *
          * Notes renders its folders inside itself, which is why these are a map of renderers
          * rather than a list of props: only one of the four has children.
          *
          * A card each, and the folders ride inside Notes' own card rather than in one of their
          * own — they are that row expanded, not a group beside it, and the gap between cards is
          * for things that sit beside each other.
          */}
        {navOrder
          .filter((id): id is SidebarNavId => id !== 'profile')
          .map((id) => {
            if (id === 'mynotes') {
              return (
                <SidebarIsland key={id}>
                  <SidebarSection
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
                </SidebarIsland>
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
              <SidebarIsland key={id}>
                <SidebarSection
                  icon={icon}
                  label={id === 'important' ? 'Important' : NAV_DESTINATIONS[id].label}
                  active={activeNav === id}
                  onSelect={() => onSelectNav(id)}
                  collapsed={collapsed}
                />
              </SidebarIsland>
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
        <SidebarIsland>
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
        </SidebarIsland>
      </nav>

      {/* The account and its sign out are a different kind of thing from the navigation above
          them, and a card of their own is what says so. It was a rule and a footer before, which
          worked because the sidebar had an edge for a footer to sit against; it no longer has
          one, and a rule floating across a transparent column would separate nothing from
          nothing. Last in the stack, so it still lands at the bottom of a tall screen. */}
      <div className={cn('shrink-0 p-1.5', ISLAND_CLASS)}>
        {/* One pill holding two controls, not one button holding another — a button inside a
            button is invalid and the inner one never gets its own clicks. */}
        <div
          className={cn(
            'flex items-center rounded-xl p-1 transition-colors',
            // Nothing at all when this is not the page you are on: the card underneath is already
            // a surface, and a second grey panel inset inside it read as a control that had been
            // disabled rather than as the account row.
            profileActive ? 'bg-[var(--color-accent-soft)]' : '',
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
