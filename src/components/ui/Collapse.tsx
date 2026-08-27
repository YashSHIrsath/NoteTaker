import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Content that grows and shrinks with its own height, for blocks that are added and removed
 * rather than always present.
 *
 * The height animation itself is the `.anim-collapse` CSS in index.css — a single-row grid
 * interpolating `0fr -> 1fr`, which is the one way to transition to a height nobody has measured.
 * Use that class directly when the block is always mounted (the Schedule dialog's due-date field);
 * use this component when it is not, because two things have to happen that CSS can't do alone:
 *
 *   Opening has to paint the closed state first. React mounts a new element already at its full
 *   height, and a transition needs a value to start from — hence the two frames below.
 *
 *   Closing has to keep the content mounted until the animation ends, or the block vanishes in one
 *   frame and there is nothing left to shrink.
 */
export interface CollapseProps {
  open: boolean
  children: ReactNode
  className?: string
}

/** Matches --motion-slow, the duration the .anim-collapse transition runs for. */
const COLLAPSE_MS = 240

export function Collapse({ open, children, className }: CollapseProps) {
  // Both start at `open`, so a block that is already open when it first mounts simply is open —
  // opening the dialog on a note that already has reminders shouldn't play an animation.
  const [mounted, setMounted] = useState(open)
  const [expanded, setExpanded] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Two frames, not one. React can batch the mount and the expand into a single paint, and a
      // transition between two values painted together never runs — the first frame is what gives
      // the browser a collapsed height to animate away from.
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setExpanded(true))
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }

    setExpanded(false)
    // Unmounted on a timer rather than on transitionend: under prefers-reduced-motion there is no
    // transition at all, so that event never fires and the content would stay mounted for good.
    const timer = window.setTimeout(() => setMounted(false), COLLAPSE_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!mounted) {
    return null
  }

  return (
    <div className={cn('anim-collapse', className)} data-open={expanded}>
      <div>{children}</div>
    </div>
  )
}
