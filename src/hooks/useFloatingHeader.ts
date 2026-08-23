import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useIsCompact } from './useMediaQuery'

/** Shared look for a page's floating header — compact widths get a translucent card hovering over
 *  the scrolling content; from lg it flattens back into a plain static band. Kept in one place so
 *  every page's top bar lines up with the others. */
export const FLOATING_HEADER_CLASS = [
  // top-3 rather than top-2: at top-2 the card almost touched the app header's search bar.
  // inset-x matches the pages' own px-4/sm:px-6 gutter — at inset-x-3 the card overhung the cards
  // it labels by a few pixels on each side, which is the kind of misalignment you can't unsee.
  'absolute inset-x-4 top-3 z-20 rounded-2xl border border-[var(--color-border)]/60',
  'bg-[var(--color-surface)]/70 px-3 py-2.5 shadow-[var(--shadow-md)] backdrop-blur-md',
  'sm:inset-x-6 sm:top-4',
  'shrink-0 lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:px-6 lg:pt-5 lg:pb-4 lg:shadow-none lg:backdrop-blur-none',
].join(' ')

/** Collapses the header's title row while keeping its controls. Pair with `condensed`. */
export const COLLAPSIBLE_TITLE_CLASS = [
  'overflow-hidden transition-all duration-200 [transition-timing-function:var(--motion-ease)]',
  'motion-reduce:transition-none',
].join(' ')

/** Past this much scroll the title rolls up; it only comes back near the top again. The gap
 *  between the two is what stops a slow scroll from flipping it on and off. */
const CONDENSE_AT = 14
const EXPAND_AT = 4

export interface FloatingHeader {
  /** Attach to the header element itself. */
  headerRef: RefObject<HTMLDivElement | null>
  /**
   * Attach to the page's scroll container. It drives the condense threshold, and its top padding
   * is kept in step with the header's height from here.
   */
  contentRef: (node: HTMLDivElement | null) => void
  /** True once the page is scrolled: the title row should roll up and leave the controls. */
  condensed: boolean
  isCompact: boolean
}

/**
 * Measures a floating header so the content below it can leave exactly that much room clear, and
 * reports whether the page has been scrolled.
 *
 * The height isn't knowable up front — headers here are one or two rows depending on width, their
 * controls come and go, and the title row collapses on scroll — so it's observed rather than
 * guessed, and the clearance follows it as it changes.
 */
export function useFloatingHeader(): FloatingHeader {
  const isCompact = useIsCompact()
  const headerRef = useRef<HTMLDivElement>(null)
  const contentNodeRef = useRef<HTMLDivElement | null>(null)
  const [condensed, setCondensed] = useState(false)

  /**
   * The tallest the header has been, which is the clearance every state reserves.
   *
   * Reserving only the *current* height is what made a barely-scrollable page unscrollable: scroll
   * past the threshold, the title rolls up, the clearance shrinks with it, and the page loses ~30px
   * of height. If that took it under the viewport the browser clamped scrollTop back to 0 — which
   * is below the expand threshold, so the title rolled back down, the page became scrollable
   * again, and the next scroll repeated the whole thing. From the outside: scrolling down snaps you
   * to the top, forever, until the content is tall enough to survive losing those 30px.
   *
   * Holding the expanded height costs a little empty space above a condensed header and cannot
   * feed back into the scroll position, because the content's height no longer depends on it.
   */
  const reservedRef = useRef(0)

  const clearance = (header: HTMLElement) => {
    reservedRef.current = Math.max(reservedRef.current, header.offsetHeight)
    return reservedRef.current + 16
  }

  // A header that genuinely changes shape (a tag row appearing, a different page) should not be
  // stuck with the tallest clearance any previous one needed.
  useLayoutEffect(() => {
    reservedRef.current = 0
  }, [isCompact])

  // The clearance is written straight to the node instead of going through state. The header
  // changes height for a fifth of a second every time the title rolls up, and a ResizeObserver
  // feeding that into React re-rendered a whole page of cards on every frame of the animation —
  // which is exactly the stutter. One style write per frame costs nothing.
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header) {
      return
    }
    const apply = () => {
      const content = contentNodeRef.current
      if (!content) {
        return
      }
      content.style.paddingTop = isCompact ? `${clearance(header)}px` : ''
    }
    apply()
    if (!isCompact) {
      return
    }
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => {
      observer.disconnect()
      const content = contentNodeRef.current
      if (content) {
        content.style.paddingTop = ''
      }
    }
  }, [isCompact, condensed])

  // A callback ref, because the scroll container is swapped out when a view changes (the folder
  // page's list and board have one each) and both the listener and the padding have to follow it.
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    contentNodeRef.current = node
    if (!node) {
      return
    }
    const header = headerRef.current
    if (header) {
      node.style.paddingTop = `${clearance(header)}px`
    }
    const onScroll = () => {
      // A functional update that returns the current value doesn't re-render, so this runs on
      // every scroll event and only costs a render when the threshold is actually crossed.
      setCondensed((current) => {
        if (!current && node.scrollTop > CONDENSE_AT) {
          return true
        }
        if (current && node.scrollTop < EXPAND_AT) {
          return false
        }
        return current
      })
    }
    onScroll()
    node.addEventListener('scroll', onScroll, { passive: true })
  }, [])

  return {
    headerRef,
    contentRef,
    condensed,
    isCompact,
  }
}
