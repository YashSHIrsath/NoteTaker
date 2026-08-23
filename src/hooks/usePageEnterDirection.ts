import type { CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * The bottom bar's own left-to-right order, which is the only thing that makes "left" and
 * "right" mean anything here. It matches the bar's tabs and the sidebar's sections; a folder or
 * a note sits where its section does, so stepping out to Tasks from a folder still reads as a
 * move rightwards rather than as arriving from nowhere.
 */
const NAV_ORDER: { index: number; matches: (pathname: string) => boolean }[] = [
  { index: 0, matches: (path) => path === '/' },
  { index: 1, matches: (path) => path === '/mynotes' || path.startsWith('/folder/') },
  { index: 2, matches: (path) => path === '/tasks' || path.startsWith('/task/') },
  { index: 3, matches: (path) => path === '/important' },
  { index: 4, matches: (path) => path === '/profile' },
]

/** How far the view travels, by how many tabs were crossed. A step to the neighbouring tab is
 *  meant to feel connected to the bar rather than thrown: it moves, but barely. Jumping the
 *  width of the bar earns more travel, up to a cap — past ~40px the slide stops reading as the
 *  same view arriving and starts reading as a different screen being pushed in. */
function travelFor(distance: number): number {
  return Math.min(20 + (distance - 1) * 9, 40)
}

function navIndexFor(pathname: string): number | null {
  return NAV_ORDER.find((entry) => entry.matches(pathname))?.index ?? null
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
