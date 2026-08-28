import { cn } from '../../lib/cn'
import { SpaceAvatar } from '../space/SpaceAvatar'
import type { SpaceSummary } from '../../types'

export interface SidebarWorkspaceItemProps {
  space: SpaceSummary
  active?: boolean
  onClick: () => void
}

/**
 * One space, nested under the sidebar's Spaces section.
 *
 * Deliberately the same size and shape as SidebarFolderItem, so the nesting reads from the rows
 * themselves: these are children of Spaces exactly as folders are children of Notes.
 *
 * Spaces and nothing else. This also carried "All spaces" and "Return home", which made the list a
 * mix of two kinds of thing — places you can be, and actions — and put the way out of a space at
 * the bottom of a list you had to open first. The Spaces row itself now goes to the spaces page,
 * and leaving a space is a control in the footer, where the space you are in is already named.
 */
export function SidebarWorkspaceItem({ space, active = false, onClick }: SidebarWorkspaceItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={space.name}
      className={cn(
        'anim-press group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
      )}
    >
      <SpaceAvatar
        spaceId={space.id}
        color={space.color}
        imageUrl={space.imageUrl}
        className="h-4 w-4 rounded"
        iconClassName="h-2.5 w-2.5"
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{space.name}</span>
      {space.memberCount > 1 ? (
        <span className="shrink-0 text-[10.5px] tabular-nums opacity-70">{space.memberCount}</span>
      ) : null}
    </button>
  )
}
