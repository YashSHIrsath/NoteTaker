import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 6

export interface AnchoredPanel<T extends HTMLElement> {
  open: boolean
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void
  /** Attach to the control the panel hangs off. */
  anchorRef: React.RefObject<T | null>
  /** Attach to the panel itself (it needs measuring to decide whether to flip). */
  panelRef: React.RefObject<HTMLDivElement | null>
  /**
   * Fixed coordinates for the panel, and the tallest it may be where it has been put — null until
   * the first measure. A panel that can outgrow the space has to honour `maxHeight` and scroll,
   * or it will be placed for a height it doesn't have.
   */
  position: { top: number; left: number; maxHeight: number } | null
}

/**
 * A small panel anchored to a control, portalled to the body.
 *
 * The portal is the point: cards clip their own overflow, so a panel rendered inside one gets
 * sliced off at the card's edge. That means fixed coordinates measured from the anchor, kept
 * inside the viewport (right-aligned controls sit near the edge by design), flipped above the
 * anchor when there's no room below, and re-measured on scroll — captured, because the anchor
 * usually scrolls inside a container rather than the window.
 */
/** Below this a panel is too short to be worth opening, so it stops giving space back. */
const MIN_PANEL_HEIGHT = 160

export function useAnchoredPanel<T extends HTMLElement>(width: number): AnchoredPanel<T> {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<AnchoredPanel<T>['position']>(null)
  const anchorRef = useRef<T | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    // A control can be scrolled under one of the app's floating headers, or under the bottom bar.
    // Placing the panel against an anchor nobody can see is what makes it look like it opened at
    // random, so the anchor is brought into view first and the panel follows it from there.
    anchorRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })

    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!anchor) {
        return
      }
      const panelHeight = panelRef.current?.offsetHeight ?? 0
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, anchor.right - width),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
      )

      /*
       * Which side, and how much room is on it.
       *
       * "Flip above when it doesn't fit below" was only half an answer: a tall panel opened from a
       * control low on the page fits on neither side, and the flip then clamped its top to the
       * viewport margin — so the panel jumped to the top corner of the screen, nowhere near the
       * button that opened it. Now the side with more room wins and the panel is told how tall it
       * may be there, so it shrinks and scrolls instead of running away.
       */
      const spaceBelow = window.innerHeight - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN
      const spaceAbove = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN
      const openDown = panelHeight === 0 || panelHeight <= spaceBelow || spaceBelow >= spaceAbove
      const maxHeight = Math.max(MIN_PANEL_HEIGHT, openDown ? spaceBelow : spaceAbove)
      const next = {
        top: openDown
          ? anchor.bottom + ANCHOR_GAP
          : Math.max(VIEWPORT_MARGIN, anchor.top - Math.min(panelHeight, maxHeight) - ANCHOR_GAP),
        left,
        maxHeight,
      }
      // Skipping an identical update keeps the re-measure below from looping: place() sets state,
      // which re-renders, which measures again.
      setPosition((current) =>
        current &&
        Math.abs(current.top - next.top) < 0.5 &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.maxHeight - next.maxHeight) < 0.5
          ? current
          : next,
      )
    }

    place()
    // The first pass runs before the panel exists, so it can't know its height and can't decide
    // whether to flip above the anchor. This second pass, once it's mounted and measurable, can.
    const frame = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, width])

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, setOpen, anchorRef, panelRef, position }
}
