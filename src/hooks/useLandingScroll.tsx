import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

/**
 * Which element the landing page actually scrolls.
 *
 * Not the window. `html, body, #root { height: 100% }` makes the app a fixed-height shell, so the
 * landing page's own `overflow-y-auto` div is the scroller — and any scroll listener bound to
 * `window` on this page fires exactly never. That is the single fact all of this exists to carry: a
 * hook that guessed wrong would not throw, it would just quietly never animate.
 */
const ScrollRootCtx = createContext<RefObject<HTMLElement | null> | null>(null)

export function ScrollRootProvider({
  elementRef,
  children,
}: {
  elementRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  return <ScrollRootCtx.Provider value={elementRef}>{children}</ScrollRootCtx.Provider>
}

function useScrollRoot(): RefObject<HTMLElement | null> | null {
  return useContext(ScrollRootCtx)
}

/**
 * The element that is really scrolling, given the one we were handed.
 *
 * Belt and braces after exactly this went wrong: an element with `overflow-y-auto` but an uncapped
 * height does not scroll — it grows, and the document scrolls behind it. Reading `scrollTop` off it
 * then returns 0 on every frame, which does not throw and does not warn; every animation just quietly
 * never happens, and it looks identical to never having written them.
 *
 * So if the element we were given has nothing to scroll, the document is asked instead.
 */
function scrollerFor(element: HTMLElement | null): HTMLElement | null {
  if (element && element.scrollHeight > element.clientHeight + 1) {
    return element
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/**
 * Scroll events, wherever they come from.
 *
 * Capture on `window`, because scroll does not bubble: a listener on the wrong element hears nothing,
 * and a listener on `window` in the bubble phase hears only the document's own scrolling. In the
 * capture phase the event passes window → document → … → target, so this catches every scroller on the
 * page whichever one turns out to be in charge.
 */
function onAnyScroll(handler: () => void): () => void {
  window.addEventListener('scroll', handler, true)
  window.addEventListener('resize', handler)
  return () => {
    window.removeEventListener('scroll', handler, true)
    window.removeEventListener('resize', handler)
  }
}

export interface RevealState {
  ref: RefObject<HTMLDivElement | null>
  shown: boolean
}

/**
 * Whether an element has come into view yet.
 *
 * IntersectionObserver rather than a scroll handler doing arithmetic: the browser already knows the
 * answer and asking it costs nothing per frame. `rootMargin` brings the trigger up short of the fold
 * so the animation is underway by the time the element is properly on screen — revealing exactly at
 * the edge means the first thing you see is the last frame.
 *
 * True once, and then never again. Reversing reveals on the way back up is the thing that makes a
 * long page feel restless, and it punishes anyone who scrolls up to re-read something.
 */
export function useReveal(options?: { rootMargin?: string; threshold?: number }): RevealState {
  const rootRef = useScrollRoot()
  const ref = useRef<HTMLDivElement | null>(null)
  /*
   * Reduced motion starts already shown.
   *
   * Read in the initialiser rather than in the effect: it is knowable before the first paint, and
   * setting it from an effect meant one render with the content hidden — which for somebody who has
   * asked for no motion is a flash of nothing, the very thing they turned off.
   */
  const [shown, setShown] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const element = ref.current
    if (!element || shown) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      {
        root: rootRef?.current ?? null,
        rootMargin: options?.rootMargin ?? '0px 0px -12% 0px',
        threshold: options?.threshold ?? 0.05,
      },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [options?.rootMargin, options?.threshold, rootRef, shown])

  return { ref, shown }
}

/**
 * How far the page has scrolled, in pixels, throttled to one read per frame.
 *
 * A scroll event can fire many times between paints, and each of these setStates re-renders whatever
 * reads it — so the raw event is coalesced into a single rAF. Without that, a parallax on a long page
 * is a stutter rather than a movement.
 */
export function useScrollOffset(): number {
  const rootRef = useScrollRoot()
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      // Resolved on every read rather than once: which element scrolls can change as the page settles
      // — a document that was shorter than the viewport at first paint has nothing to scroll, and the
      // answer at mount would then be wrong for the whole session.
      const element = scrollerFor(rootRef?.current ?? null)
      setOffset(element?.scrollTop ?? 0)
    }
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(read)
      }
    }
    const detach = onAnyScroll(onScroll)
    read()
    return () => {
      detach()
      if (frame !== 0) {
        cancelAnimationFrame(frame)
      }
    }
  }, [rootRef])

  return offset
}

/**
 * How far down the whole page we are, 0 to 1.
 *
 * Measured inside the listener rather than by reading the scroller's dimensions during a render. Both
 * would give the same number most of the time, but the render version has to read a ref — which is
 * null on the first pass and stale whenever the content settles — so the progress bar would start
 * wrong and only correct itself on the next scroll.
 */
export function usePageProgress(): number {
  const rootRef = useScrollRoot()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      const element = scrollerFor(rootRef?.current ?? null)
      if (!element) {
        return
      }
      // The scrollable distance, not the content height: a page shorter than the viewport has none,
      // and dividing by it would put a NaN in the bar's transform — which removes the transform
      // rather than erroring, so the bar would sit at full width.
      const total = element.scrollHeight - element.clientHeight
      setProgress(total <= 0 ? 0 : Math.min(1, Math.max(0, element.scrollTop / total)))
    }
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(read)
      }
    }
    const detach = onAnyScroll(onScroll)
    /*
     * Re-measured when the content changes height.
     *
     * This page settles after first paint — webfonts land, the carousel lays out, the deck sizes
     * itself — so a total taken once at mount is wrong by a few hundred pixels for the first second,
     * and the bar would read as full before the page was.
     */
    const target = rootRef?.current
    const observer = target ? new ResizeObserver(onScroll) : null
    if (target && observer) {
      observer.observe(target)
    }
    read()
    return () => {
      detach()
      observer?.disconnect()
      if (frame !== 0) {
        cancelAnimationFrame(frame)
      }
    }
  }, [rootRef])

  return progress
}

/**
 * How far a *playhead at the middle of the screen* has travelled through an element: 0 as the
 * element's top reaches the middle, 1 as its bottom leaves it.
 *
 * This is what drives anything scrubbed rather than triggered — a line that draws itself, a marker
 * walking down a timeline.
 *
 * The first version measured the element's whole passage through the viewport, top-entering-bottom to
 * bottom-leaving-top. Arithmetically fine and useless in practice: by the moment a tall section first
 * fills the screen that measure already reads about 0.7, so the line arrived four-fifths drawn and
 * finished within a flick of the wheel. It looked stuck, because the part of its travel that happens
 * while you are actually looking at it is the last fifth.
 *
 * Anchoring to the middle of the viewport instead means the line is drawn to exactly the row you are
 * reading, all the way down the section — which is the whole point of drawing it.
 */
export function useProgress(ref: RefObject<HTMLElement | null>): number {
  // No scroll root needed: a bounding rect is measured against the viewport, and the listener is on
  // window in the capture phase — so this works whichever element turns out to be scrolling.
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    let frame = 0
    const read = () => {
      frame = 0
      const rect = element.getBoundingClientRect()
      // The viewport's own height, not the scroller's: a rect is measured against the viewport, so
      // the playhead has to be too. These are the same number when the scroller fills the screen and
      // different the moment it does not.
      const playhead = window.innerHeight / 2
      /*
       * Guarded against a zero height, which a collapsed or not-yet-laid-out element would otherwise
       * turn into a division by zero — and a NaN in a transform silently *removes* the transform
       * rather than erroring, so the effect would simply never happen.
       */
      const travelled = playhead - rect.top
      setProgress(rect.height <= 0 ? 0 : Math.min(1, Math.max(0, travelled / rect.height)))
    }
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(read)
      }
    }
    const detach = onAnyScroll(onScroll)
    read()
    return () => {
      detach()
      if (frame !== 0) {
        cancelAnimationFrame(frame)
      }
    }
  }, [ref])

  return progress
}

/**
 * Which of these sections the reader is currently in.
 *
 * IntersectionObserver rather than comparing `scrollTop` against a list of `offsetTop`s: the offsets
 * are only correct until something above them changes height, and on this page plenty does — the
 * webfonts land, the carousel lays out, the deck sizes itself. The browser re-answers this for free
 * as the page settles; arithmetic would have to be re-run, and nothing tells it when to.
 *
 * The trigger is a thin band across the upper-middle of the viewport, not the whole of it. With the
 * whole viewport, two sections are on screen for most of any scroll and "current" flickers between
 * them; with a band, the current section is simply the one the reader is looking at. Nothing matches
 * while the hero fills the screen, which is correct — the index is not on show there either.
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const rootRef = useScrollRoot()
  const [active, setActive] = useState<string | null>(null)
  // Callers build this array inline, so a new one arrives every render. Keying the effect on the
  // joined ids rather than the array means it re-runs when the sections change and not before.
  const key = ids.join('|')

  useEffect(() => {
    const order = key.split('|').filter(Boolean)
    const elements = order
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) {
      return
    }

    // The observer's root has to be the element that actually scrolls, and on this page that may be
    // the document rather than the div we were handed — see scrollerFor. A document scroller is
    // spelled `null` here, not passed as an element.
    const scroller = scrollerFor(rootRef?.current ?? null)
    const root =
      scroller && scroller !== document.scrollingElement && scroller !== document.documentElement
        ? scroller
        : null

    const inBand = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            inBand.add(entry.target.id)
          } else {
            inBand.delete(entry.target.id)
          }
        }
        // Document order decides ties, so a short section straddling the band with its neighbour
        // never steals the mark from the one above it.
        setActive(order.find((id) => inBand.has(id)) ?? null)
      },
      { root, rootMargin: '-38% 0px -56% 0px', threshold: 0 },
    )

    for (const element of elements) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [key, rootRef])

  return active
}
