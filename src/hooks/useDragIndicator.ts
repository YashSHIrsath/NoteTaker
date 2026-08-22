import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Movement before a press becomes a drag, so a tap on a tab is still a tap. */
const DRAG_THRESHOLD = 6
/** A flick this fast (slots per ms) carries the blob past the slot it was released over. Set
 *  well above a casual drag's speed: at a lower bar, ordinary movement registered as a throw. */
const FLING_VELOCITY = 0.014
/** How far ahead a throw is projected, in ms of its own velocity. */
const PROJECTION_MS = 60
/** And never further than this, however hard it's thrown — a flick should nudge the blob to the
 *  next tab, not fire it across the bar. Overshooting several tabs made the gesture unusable for
 *  picking one. */
const MAX_FLING_SLOTS = 1
/** Stretch and thinning per slot of travel, and the ceiling on both. */
const STRETCH_PER_SLOT = 0.06
const THIN_PER_SLOT = 0.03
const MAX_STRETCH_SLOTS = 3

export interface DragIndicator {
  /** Slot the blob is drawn at — fractional while dragging, so it tracks the finger. */
  position: number
  /** How much it's stretched right now, in slots. */
  stretch: number
  dragging: boolean
  /** Attach to the bar. Ignores mouse pointers, which keep plain clicking. */
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  /** True if the gesture that just ended was a drag, so the tap it produces can be ignored. */
  wasDragged: () => boolean
}

/**
 * The bar's indicator, draggable.
 *
 * Two things move it: a tap on a tab (the blob travels there under CSS, stretching by distance)
 * and a finger dragging it along the bar. While dragging, `position` is fractional and the
 * transition is off so it sits exactly under the finger; on release the landing slot comes from
 * velocity first and position second — a flick carries past the slot it was let go over, a slow
 * drag simply rounds to the nearest — and `onSettle` navigates there.
 *
 * @param count number of slots
 * @param activeIndex the slot the app is actually on, which the blob returns to when not dragging
 * @param onSettle called with the slot a release landed on, when it differs from activeIndex
 */
export function useDragIndicator(
  count: number,
  activeIndex: number,
  onSettle: (index: number) => void,
): DragIndicator {
  const [drag, setDrag] = useState<number | null>(null)
  const [stretch, setStretch] = useState(0)
  const previousIndexRef = useRef(activeIndex)
  const relaxTimerRef = useRef<number | null>(null)
  const draggedRef = useRef(false)
  const onSettleRef = useRef(onSettle)

  useEffect(() => {
    onSettleRef.current = onSettle
  }, [onSettle])

  const relaxSoon = useCallback(() => {
    if (relaxTimerRef.current !== null) {
      window.clearTimeout(relaxTimerRef.current)
    }
    relaxTimerRef.current = window.setTimeout(() => setStretch(0), 200)
  }, [])

  // A tap-driven move: stretch by how far it's about to travel, then let it relax under the same
  // transition that carries the travel. Both the previous index and the timer are refs — as state
  // they re-ran this effect, and the re-run's cleanup cancelled the relax timer, which left the
  // blob permanently stretched.
  useEffect(() => {
    const previous = previousIndexRef.current
    if (activeIndex === previous) {
      return
    }
    previousIndexRef.current = activeIndex
    setStretch(Math.min(Math.abs(activeIndex - previous), MAX_STRETCH_SLOTS))
    relaxSoon()
  }, [activeIndex, relaxSoon])

  useEffect(
    () => () => {
      if (relaxTimerRef.current !== null) {
        window.clearTimeout(relaxTimerRef.current)
      }
    },
    [],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // A mouse keeps plain clicking: dragging a nav indicator with a cursor isn't a gesture
      // anyone reaches for, and claiming mousedown would break ordinary clicks.
      if (event.pointerType === 'mouse' || count < 2) {
        return
      }
      const bar = event.currentTarget
      const rect = bar.getBoundingClientRect()
      // One slot's width, so the finger's travel converts straight into slots.
      const slotWidth = rect.width / count
      const startX = event.clientX
      let started = false
      let position = activeIndex
      let velocity = 0
      let lastX = startX
      let lastTime = event.timeStamp
      draggedRef.current = false

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== event.pointerId) {
          return
        }
        if (!started) {
          if (Math.abs(moveEvent.clientX - startX) < DRAG_THRESHOLD) {
            return
          }
          started = true
          draggedRef.current = true
        }
        const elapsed = moveEvent.timeStamp - lastTime
        if (elapsed > 0) {
          // Slots per ms, smoothed so one jittery sample can't decide the throw.
          const sample = (moveEvent.clientX - lastX) / slotWidth / elapsed
          velocity = 0.7 * sample + 0.3 * velocity
        }
        lastX = moveEvent.clientX
        lastTime = moveEvent.timeStamp
        moveEvent.preventDefault()

        // Clamped to the ends: there's nowhere past the first and last tab to go.
        position = Math.max(0, Math.min(count - 1, activeIndex + (moveEvent.clientX - startX) / slotWidth))
        setDrag(position)
        // Stretch with speed while under the finger — the faster it's dragged, the more it gives.
        setStretch(Math.min(Math.abs(velocity) * 90, MAX_STRETCH_SLOTS))
      }

      const finish = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        if (!started) {
          return
        }
        const carry =
          Math.abs(velocity) > FLING_VELOCITY
            ? Math.max(-MAX_FLING_SLOTS, Math.min(MAX_FLING_SLOTS, velocity * PROJECTION_MS))
            : 0
        const projected = position + carry
        const landed = Math.max(0, Math.min(count - 1, Math.round(projected)))

        setDrag(null)
        setStretch(Math.min(Math.abs(landed - position) + 0.6, MAX_STRETCH_SLOTS))
        relaxSoon()
        if (landed !== activeIndex) {
          onSettleRef.current(landed)
        } else {
          // Same slot: nothing navigates, so the blob has to be told to come home itself.
          previousIndexRef.current = landed
        }
        window.setTimeout(() => {
          draggedRef.current = false
        }, 0)
      }

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== event.pointerId) {
          return
        }
        finish()
      }

      window.addEventListener('pointermove', onMove, { passive: false })
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [activeIndex, count, relaxSoon],
  )

  return {
    position: drag ?? activeIndex,
    stretch,
    dragging: drag !== null,
    onPointerDown,
    wasDragged: () => draggedRef.current,
  }
}

export const INDICATOR_STRETCH_PER_SLOT = STRETCH_PER_SLOT
export const INDICATOR_THIN_PER_SLOT = THIN_PER_SLOT
