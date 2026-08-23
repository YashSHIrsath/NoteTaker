import { useEffect, useRef, useState } from 'react'

/**
 * Counts from 0 up to `target` on mount, and again whenever the target changes.
 *
 * Driven by requestAnimationFrame against real elapsed time rather than a fixed step per frame, so
 * the run takes the same wall-clock duration on a 60Hz and a 144Hz display instead of finishing
 * twice as fast on the better screen.
 *
 * Eased out, because a linear count reads like a progress bar where this should land rather than
 * stop. Under prefers-reduced-motion the target is returned straight through — a number ticking
 * upward is exactly what that setting is asking us not to do — and the effect never runs, so
 * there's no state to go stale behind it.
 */
export function useCountUp(target: number, durationMs = 750): number {
  const animate =
    durationMs > 0 &&
    !(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  const [value, setValue] = useState(0)
  const frameRef = useRef(0)

  useEffect(() => {
    if (!animate) {
      return
    }

    let start: number | null = null
    const step = (now: number) => {
      start ??= now
      const progress = Math.min(1, (now - start) / durationMs)
      // easeOutCubic
      setValue(Math.round(target * (1 - (1 - progress) ** 3)))
      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(step)
      }
    }

    frameRef.current = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frameRef.current)
  }, [animate, durationMs, target])

  return animate ? value : target
}
