import type { CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import {
  cacheNavPreferences,
  DEFAULT_NAV_ORDER,
  navIdForPath,
  resolveNavOrder,
  type NavId,
} from '../lib/navOrder'

/**
 * The bar's current order, which is the only thing that makes "left" and "right" mean anything.
 *
 * Held as module state and pushed in by useTrackNavSection, because this file has no component to
 * read the account's preference from and the pages that ask for a direction mount in no reliable
 * order. It used to be a hardcoded list that had to match the bar's own — and didn't: the bar put
 * Starred third and Tasks fourth while this believed the reverse, so moving between those two
 * animated backwards. There is one list now (lib/navOrder), and the bar is drawn from it too.
 */
let navOrder: NavId[] = DEFAULT_NAV_ORDER

export function setNavOrder(order: NavId[]): void {
  if (order.length === navOrder.length && order.every((id, i) => id === navOrder[i])) {
    return
  }
  // The remembered position is an index into the *old* order, so it is translated rather than
  // thrown away. Discarding it meant the first navigation after a reorder had no previous section
  // to compare against and played no animation at all — which read as reordering having broken the
  // transitions, when it had only forgotten where you were standing.
  const lastId = lastNavIndex === null ? null : navOrder[lastNavIndex] ?? null
  navOrder = order
  const remapped = lastId === null ? -1 : order.indexOf(lastId)
  lastNavIndex = remapped === -1 ? null : remapped
  decidedPath = null
  decidedJourney = null
}

/** How far the view travels, by how many tabs were crossed. A step to the neighbouring tab is
 *  meant to feel connected to the bar rather than thrown: it moves, but barely. Jumping the
 *  width of the bar earns more travel, up to a cap — past ~40px the slide stops reading as the
 *  same view arriving and starts reading as a different screen being pushed in. */
function travelFor(distance: number): number {
  return Math.min(20 + (distance - 1) * 9, 40)
}

function navIndexFor(pathname: string): number | null {
  const id = navIdForPath(pathname)
  if (id === null) {
    return null
  }
  const index = navOrder.indexOf(id)
  return index === -1 ? null : index
}

/**
 * Which side of the bar you arrived from.
 *
 * The bar is the coordinate system, and the rule is that a view arrives from the side you came
 * from: step in from Tree or Notes, which sit to the left, and it comes in from the left; step
 * back from Starred or You, which sit to the right, and it comes in from the right. The previous
 * section being at a lower index means it was to the left of this one — that is the whole test.
 *
 * The previous position is module state on purpose. A page unmounts when you leave it, so a ref
 * inside one cannot remember where you came from; this outlives the pages it describes.
 */
let lastNavIndex: number | null = null

export type ArrivalSide = 'left' | 'right'

export interface Journey {
  /** The side the previous section sits on, which is the side this view arrives from. */
  cameFrom: ArrivalSide
  /** How many tabs were crossed, which is how far it travels. */
  distance: number
}

/**
 * The journey belongs to the navigation, not to whichever component asked first.
 *
 * It used to be frozen per component, in a useState initialiser, on the assumption that
 * everything on a page mounts with it. The task canvas doesn't: it's behind `tasks.length > 0`,
 * and it swaps between two JSX branches when the account's view style resolves — a remount, after
 * the page's effect had already moved lastNavIndex on. Arriving late, it computed "same section,
 * no journey" and quietly fell back to the default side, so the shrink kept coming from the right
 * however you got there. Deciding once per path and handing out that same answer means the answer
 * can't depend on when a component happens to mount.
 */
let decidedPath: string | null = null
let decidedJourney: Journey | null = null

function journeyFor(pathname: string): Journey | null {
  if (decidedPath === pathname) {
    return decidedJourney
  }
  const index = navIndexFor(pathname)
  decidedJourney =
    index === null || lastNavIndex === null || index === lastNavIndex
      ? // A first load, a reload, or a move within the same section: no journey to show.
        null
      : {
          // Moving to a higher index means the tab you left is behind you on the left.
          cameFrom: index > lastNavIndex ? 'left' : 'right',
          distance: Math.abs(index - lastNavIndex),
        }
  decidedPath = pathname
  if (index !== null) {
    lastNavIndex = index
  }
  return decidedJourney
}

/**
 * Guarded by the path, so it settles on the first render of a navigation and every later render —
 * and every component, whenever it mounts — reads that same decision back. Re-rendering therefore
 * can't restart an animation half-way through: the class and offset it returns don't change.
 */
function useJourney(): Journey | null {
  const { pathname } = useLocation()
  return journeyFor(pathname)
}

/**
 * Records the section for every route, whether or not it animates. Call it once, high enough up
 * to render on every page — AppLayout.
 *
 * Without it, lastNavIndex only ever moved when a page that *uses* one of these hooks rendered,
 * which is Tasks and Important and nothing else. Tree, Notes and the folder views were invisible
 * to it, so "the section you came from" actually meant "the last Tasks or Important page you
 * happened to visit". Coming to Tasks from Notes, with Important as the last one before that, it
 * read the move as a step leftwards off Important and left the shrink pointing the way it always
 * had — and which page looked correct depended on the order you'd visited them in.
 */
export function useTrackNavSection(): void {
  // The bar's order comes from the account, so it is read here — the one hook guaranteed to run on
  // every route — and handed to the module state the direction maths uses.
  const { user } = useAuth()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  // Echoed to the device on every route, so the next cold start can draw the right bar before the
  // session has finished restoring. Writing here rather than in the settings panel means it also
  // repairs itself on a device that has never opened settings.
  cacheNavPreferences(metadata)
  setNavOrder(resolveNavOrder(metadata))
  useJourney()
}

export interface PageEnter {
  className?: string
  style?: CSSProperties
}

export function usePageEnter(): PageEnter {
  const journey = useJourney()
  if (!journey) {
    return {}
  }
  const travel = travelFor(journey.distance)
  return {
    className: 'anim-page-enter',
    // Negative starts the view left of where it lands, so it moves in from the left; positive
    // does the mirror. The sign is the whole point.
    style: {
      '--page-enter-x': `${journey.cameFrom === 'left' ? -travel : travel}px`,
    } as CSSProperties,
  }
}

/** The side alone, for the parts of a page that arrive under their own animation rather than
 *  riding the page's — the task canvas has its own arrival and only needs to know which way. */
export function useArrivalSide(): ArrivalSide | null {
  return useJourney()?.cameFrom ?? null
}
