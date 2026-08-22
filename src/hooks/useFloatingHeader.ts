import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
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

export interface FloatingHeader {
  /** Attach to the header element itself. */
  headerRef: RefObject<HTMLDivElement | null>
  /** Apply to the scroll container so its first row starts clear of the floating card. */
  contentStyle: CSSProperties | undefined
  isCompact: boolean
}

/**
 * Measures a floating header so the content below it can leave exactly that much room clear.
 * The height isn't knowable up front — headers here are one or two rows depending on width, and
 * their controls (view toggles, tag filters) come and go — so it's observed rather than guessed.
 */
export function useFloatingHeader(): FloatingHeader {
  const isCompact = useIsCompact()
  const headerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

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

  return {
    headerRef,
    contentStyle: isCompact && height > 0 ? { paddingTop: height + 16 } : undefined,
    isCompact,
  }
}
