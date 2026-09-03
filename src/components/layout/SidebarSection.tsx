import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface SidebarSectionProps {
  icon: ReactNode
  label: string
  active?: boolean
  onSelect?: () => void
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  collapsed?: boolean
  /**
   * A count that wants answering — pending invitations on Spaces, today.
   *
   * Not a decoration and not a total: this is for things addressed to *you* that are waiting, which
   * is why it is absent rather than zero when there is nothing. Collapsed, it becomes a dot, since
   * there is no room for a number and the point is only that something is there.
   */
  badge?: number
  children?: ReactNode
}

/**
 * One row of the sidebar's navigation.
 *
 * Two things about the shape are deliberate. The disclosure chevron sits at the row's *right*,
 * inside the row, rather than in a gutter to its left — a left-hand chevron meant every
 * non-expandable row had to reserve an empty 28px spacer to keep the icons aligned, so the whole
 * list read as indented from nothing. And the row is a container with two buttons in it rather
 * than one button: "go to Notes" and "show Notes' folders" are separate actions, and a button
 * inside a button is invalid markup whose inner half never gets its own clicks.
 *
 * The active row is marked three ways — tinted fill, accent glyph and label, and a bar on the
 * leading edge — because fill alone is easy to lose against a tinted folder chip sitting on the
 * same row.
 */
export function SidebarSection({
  icon,
  label,
  active = false,
  onSelect,
  expandable = false,
  expanded = false,
  onToggleExpand,
  collapsed = false,
  badge,
  children,
}: SidebarSectionProps) {
  const badgeCount = badge && badge > 0 ? badge : 0

  if (collapsed) {
    return (
      <button
        type="button"
        title={badgeCount ? `${label} — ${badgeCount} waiting` : label}
        aria-label={badgeCount ? `${label}, ${badgeCount} waiting` : label}
        onClick={onSelect}
        className={cn(
          'flex h-11 w-full items-center justify-center rounded-xl transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
          active
            ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] ring-1 ring-inset ring-[var(--color-accent)]/25'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
        )}
      >
        {/* relative on the wrapper, so the dot rides the glyph rather than the 44px row. */}
        <span className="relative inline-flex">
          {icon}
          {badgeCount ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-surface)]"
            />
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <div>
      <div
        className={cn(
          'relative flex items-center gap-0.5 rounded-xl transition-colors',
          active
            ? 'bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]/20'
            : 'hover:bg-[var(--color-hover)]',
        )}
      >
        {active ? (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--color-accent)]"
          />
        ) : null}

        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-left text-[13.5px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/25',
          )}
        >
          <span
            className={cn(
              'inline-flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
              active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]',
            )}
          >
            {icon}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              active
                ? 'font-semibold text-[var(--color-accent-ink)]'
                : 'font-medium text-[var(--color-text)]',
            )}
          >
            {label}
          </span>
          {badgeCount ? (
            <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10.5px] font-bold tabular-nums text-white">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          ) : null}
        </button>

        {expandable ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            aria-expanded={expanded}
            onClick={onToggleExpand}
            className={cn(
              'mr-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors',
              'text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25',
            )}
          >
            {/* One rotating chevron rather than two icons: the turn is the animation, and there's
                no frame where the glyph swaps out from under the pointer. */}
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none',
                expanded && 'rotate-90',
              )}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {expandable && expanded && children ? (
        /*
         * The children, hung off the row above them. See `.sidebar-tree` in index.css for the
         * connectors themselves — it draws a trunk and an elbow into each row out of the rows'
         * own boxes, so nothing here has to know how many there are or how tall they got.
         *
         * Indented rather than merely listed underneath: level with their parent they read as its
         * siblings, which is the one thing this section exists not to say.
         *
         * The two numbers here are the ones the connectors are aimed at, so they travel together.
         * `pl-9` puts the rows 36px in, and the trunk lands a stub's width to their left — 22px,
         * which is the parent row button's 12px of padding plus half of its 20px glyph, so the
         * trunk falls directly beneath the icon of the folder it belongs to. `mt-1` plus `py-1` is
         * the 8px the first child's elbow reaches back up through to touch that row's underside.
         * Move the row's padding, its glyph, or either of these, and the rest have to follow.
         */
        <div className="sidebar-tree mt-1 py-1 pl-9">{children}</div>
      ) : null}
    </div>
  )
}
