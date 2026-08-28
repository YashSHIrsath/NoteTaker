import { ClipboardList, Folder, ListTree, Star, Users } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import type { SidebarNavId } from '../../types'
import { NAV_DESTINATIONS, type NavId } from '../../lib/navOrder'
import { useDisplaySettings } from '../../hooks/useDisplaySettings'
import { useSpaces } from '../../hooks/useSpaces'
import { useWorkspace } from '../../hooks/useWorkspace'
import { SpaceAvatar } from '../space/SpaceAvatar'
import { useAuth } from '../../hooks/useAuth'
import {
  INDICATOR_STRETCH_PER_SLOT,
  INDICATOR_THIN_PER_SLOT,
  useDragIndicator,
} from '../../hooks/useDragIndicator'
import { cn } from '../../lib/cn'

type BottomNavId = NavId

/** The glyph for each destination. The order the tabs appear in is the account's, not this file's
 *  — see lib/navOrder. Profile's icon is the account's own avatar, filled in below. */
const ICONS: Record<NavId, ReactNode> = {
  tree: <ListTree className="h-[18px] w-[18px]" aria-hidden />,
  mynotes: <Folder className="h-[18px] w-[18px]" aria-hidden />,
  important: <Star className="h-[18px] w-[18px]" aria-hidden />,
  tasks: <ClipboardList className="h-[18px] w-[18px]" aria-hidden />,
  spaces: <Users className="h-[18px] w-[18px]" aria-hidden />,
  profile: null,
}

export interface BottomNavProps {
  activeNav?: SidebarNavId
  profileActive?: boolean
  onSelectNav: (id: SidebarNavId) => void
  onOpenProfile: () => void
}

/**
 * Primary navigation below `lg`, where there's no room for a sidebar: a floating glass bar.
 *
 * The active indicator is one absolutely-positioned pill translated across the bar rather than a
 * background on each button — with five equal-width items, `translateX(index * 100%)` is exact,
 * and one moving element is what lets it behave like a blob of liquid: it stretches along its
 * travel, follows a finger dragged across the bar, and lands where a throw was heading.
 */
export function BottomNav({ activeNav, profileActive = false, onSelectNav, onOpenProfile }: BottomNavProps) {
  const { user } = useAuth()
  const metadata = (user?.user_metadata ?? {}) as { full_name?: string; avatar_url?: string }
  // Rebuilt from the order in force every render, so reordering in settings moves the tabs and
  // the page-transition direction together — they read the same list. Inside a shared space that
  // order belongs to the space, so a member rearranging the bar rearranges it for everyone.
  const { navOrder } = useDisplaySettings()
  const workspace = useWorkspace()
  const { getSpace } = useSpaces()
  const currentSpace = workspace.kind === 'space' ? getSpace(workspace.id) : undefined
  /*
   * Five tabs: the four pages you work in, and the account.
   *
   * Spaces is filtered out rather than removed from the order, because the order is also the
   * sidebar's — where Spaces is a row with its own list under it. Down here it was a sixth item and
   * the odd one out: a list of workspaces sitting beside the pages inside one. It is the button in
   * the header now, which is where a workspace switcher belongs.
   *
   * Inside a space the last tab is that space's own page, so it wears the space's face rather than
   * yours. Below `lg` this bar and the header are the only chrome on screen, and the tinted grounds
   * say you are in *a* space — this says which one.
   */
  const items = navOrder
    .filter((id) => id !== 'spaces')
    .map((id) => ({
      id,
      label: id === 'profile' && currentSpace ? currentSpace.name : NAV_DESTINATIONS[id].label,
      icon:
        id === 'profile' && currentSpace ? (
          <SpaceAvatar
            spaceId={currentSpace.id}
            color={currentSpace.color}
            imageUrl={currentSpace.imageUrl}
            className="h-[18px] w-[18px] rounded"
            iconClassName="h-2.5 w-2.5"
          />
        ) : (
          ICONS[id]
        ),
    }))
  const initial = (metadata.full_name?.trim() || user?.email || 'Y').charAt(0).toUpperCase()

  // Stays "which page am I on". Which *workspace* is carried by the tab's own face and label, and by
  // the tinted grounds — lighting up Spaces from inside a folder would say the wrong thing twice.
  const activeId: BottomNavId | undefined = profileActive ? 'profile' : activeNav
  const activeIndex = items.findIndex((item) => item.id === activeId)

  const selectIndex = (index: number) => {
    const item = items[index]
    if (!item) {
      return
    }
    if (item.id === 'profile') {
      onOpenProfile()
    } else {
      onSelectNav(item.id as SidebarNavId)
    }
  }

  // Tap a tab or drag the blob — both come through here (see useDragIndicator).
  const indicator = useDragIndicator(items.length, activeIndex, selectIndex)

  // The bar is fixed, so it takes no space in the layout and anything that has to sit clear of it
  // (the folders sheet) needs its height. Measured rather than declared: the height follows the
  // font metrics and the avatar, and a hard-coded guess drifts the moment either changes. Written
  // straight to the root as a CSS variable so it costs no re-render — see --bottom-nav-h.
  const barRef = useRef<HTMLDivElement>(null)

  /**
   * Animates the tabs when the bar is reordered.
   *
   * Reordering swaps keyed elements, which React does by re-inserting the DOM nodes — instant, and
   * nothing a transition can catch. So this is FLIP: remember where every tab was, and the moment
   * the new arrangement is laid out, offset each one back to where it used to be and release it.
   * The browser then animates a transform, which it can, rather than a reflow, which it can't.
   *
   * Runs on every layout, but does nothing unless a tab actually moved — selecting a tab or
   * resizing the bar leaves every left edge where it was.
   */
  const tabRefs = useRef(new Map<BottomNavId, HTMLButtonElement>())
  const tabLefts = useRef(new Map<BottomNavId, number>())
  const flipFrames = useRef<number[]>([])
  useLayoutEffect(() => {
    const previous = tabLefts.current
    const next = new Map<BottomNavId, number>()
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const moved: Array<[HTMLButtonElement, number]> = []

    for (const [id, element] of tabRefs.current) {
      /*
       * offsetLeft, not getBoundingClientRect().left.
       *
       * A bounding rect includes the transform this very effect applies, so a re-render while the
       * slide was still running measured the tab where it was *animating*, decided it had moved
       * again, and started a second animation over the first. Saving a preference renders twice —
       * once from updateUser, once from the USER_UPDATED event behind it — so that happened every
       * time, which is the double hit. offsetLeft reports the laid-out position and ignores
       * transforms, so the second render measures exactly what the first did and does nothing.
       */
      const left = element.offsetLeft
      next.set(id, left)
      const before = previous.get(id)
      if (before !== undefined && before !== left && !reduced) {
        moved.push([element, before - left])
      }
    }
    tabLefts.current = next

    if (moved.length === 0) {
      return
    }

    // Any frames still queued belong to a slide that is being superseded.
    for (const frame of flipFrames.current) {
      cancelAnimationFrame(frame)
    }
    flipFrames.current = []

    for (const [element, offset] of moved) {
      element.style.transition = 'none'
      element.style.transform = `translateX(${offset}px)`
    }
    // Two frames: one to let the inverted position paint, then the transition that removes it. In
    // one frame the browser coalesces both style changes and nothing moves.
    flipFrames.current.push(
      requestAnimationFrame(() => {
        flipFrames.current.push(
          requestAnimationFrame(() => {
            for (const [element] of moved) {
              element.style.transition = 'transform 380ms cubic-bezier(0.22, 0.61, 0.36, 1)'
              element.style.transform = ''
            }
          }),
        )
      }),
    )
  })

  useEffect(
    () => () => {
      for (const frame of flipFrames.current) {
        cancelAnimationFrame(frame)
      }
    },
    [],
  )

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center lg:hidden',
        // Clear of the iOS home indicator / Android gesture bar. The token, not the literal, so
        // the folders sheet stacks on exactly the same number.
        'px-3 pb-[var(--bottom-nav-safe)]',
      )}
    >
      {/* touch-none so dragging the blob sideways doesn't scroll the page under it. */}
      <div
        ref={barRef}
        onPointerDown={indicator.onPointerDown}
        className={cn(
          'pointer-events-auto relative flex w-full max-w-md touch-none items-center overflow-hidden rounded-full p-1',
          // Glass: a translucent tint of the app's own surface over a blur, so it picks up
          // whatever scrolls underneath and stays legible in either theme.
          'border border-[var(--color-border)]/70 bg-[var(--color-surface)]/70 backdrop-blur-xl',
          'shadow-[var(--shadow-lg)]',
          'supports-[backdrop-filter:blur(0px)]:bg-[var(--color-surface)]/60',
        )}
      >
        {activeIndex >= 0 ? (
          <span
            aria-hidden
            className={cn(
              // Width comes from the number of tabs, not a literal: the bar grew a sixth
              // destination with Shared Spaces, and a hardcoded fifth left the indicator wider than
              // its slot and drifting further from it with every step across the bar.
              'absolute inset-y-1 left-1 rounded-full',
              'bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]/25',
              // One transition for travel and stretch alike, on an overshooting curve so it
              // arrives with a wobble instead of stopping dead — but never while dragging, where
              // any transition would put the blob behind the finger.
              indicator.dragging
                ? 'transition-none'
                : 'transition-transform duration-[420ms] [transition-timing-function:cubic-bezier(0.2,1.3,0.28,1)]',
              'motion-reduce:transition-none',
            )}
            style={{
              width: `calc((100% - 0.5rem) / ${items.length})`,
              // translate first, so the percentage is of the untransformed width and the scales
              // can't drag the indicator off its slot. The position is fractional while dragging.
              transform: [
                `translateX(${indicator.position * 100}%)`,
                `scaleX(${1 + indicator.stretch * INDICATOR_STRETCH_PER_SLOT})`,
                `scaleY(${1 - indicator.stretch * INDICATOR_THIN_PER_SLOT})`,
              ].join(' '),
            }}
          />
        ) : null}

        {items.map((item) => {
          const active = activeId === item.id
          return (
            <button
              key={item.id}
              ref={(element) => {
                if (element) {
                  tabRefs.current.set(item.id, element)
                } else {
                  tabRefs.current.delete(item.id)
                }
              }}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                // A drag ends with a click on whichever tab it finished over; the drag has already
                // navigated, so this one is ignored.
                if (indicator.wasDragged()) {
                  return
                }
                selectIndex(items.indexOf(item))
              }}
              className={cn(
                'anim-press relative z-10 flex flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-1.5',
                'text-[10px] font-semibold transition-colors',
                active ? 'text-[var(--color-accent-ink)]' : 'text-[var(--color-text-muted)]',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center transition-transform duration-200',
                  '[transition-timing-function:var(--motion-spring)] motion-reduce:transition-none',
                  active ? 'scale-110' : 'scale-100',
                )}
              >
                {/* Inside a space this tab is the space's page, and item.icon is already the
                  * space's face — so your own is only drawn when the tab is actually yours. */}
                {item.id === 'profile' && !currentSpace ? (
                  metadata.avatar_url ? (
                    <img
                      src={metadata.avatar_url}
                      alt=""
                      className={cn(
                        'h-6 w-6 rounded-full object-cover',
                        active ? 'ring-2 ring-[var(--color-accent)]' : 'ring-1 ring-[var(--color-border)]',
                      )}
                    />
                  ) : (
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))' }}
                      aria-hidden
                    >
                      {initial}
                    </span>
                  )
                ) : (
                  item.icon
                )}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
