import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { useIsCompact } from './useMediaQuery'

/** Shared look for a page's floating header — compact widths get a translucent card hovering over
 *  the scrolling content; from lg it flattens back into a plain static band. Kept in one place so
 *  every page's top bar lines up with the others. */
export const FLOATING_HEADER_CLASS = [
  'absolute inset-x-3 top-2 z-20 rounded-2xl border border-[var(--color-border)]/60',
  'bg-[var(--color-surface)]/70 px-3 py-2.5 shadow-[var(--shadow-md)] backdrop-blur-md',
  'sm:inset-x-6 sm:top-3',
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
  /** Attach to the page's scroll container — the header condenses from its scroll position. */
  contentRef: (node: HTMLDivElement | null) => void
  /** Apply to the scroll container so its first row starts clear of the floating card. */
  contentStyle: CSSProperties | undefined
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
  const [height, setHeight] = useState(0)
  const [condensed, setCondensed] = useState(false)

  useLayoutEffect(() => {
    const node = headerRef.current
    if (!node || !isCompact) {
      return
    }
    const measure = () => setHeight(node.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [isCompact])

  // A callback ref, because the scroll container is swapped out when a view changes (the folder
  // page's list and board have one each) and the listener has to follow it.
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return
    }
    const onScroll = () => {
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
    contentStyle: isCompact && height > 0 ? { paddingTop: height + 16 } : undefined,
    condensed,
    isCompact,
  }
}
