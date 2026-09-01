import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { LogoLoader } from '../brand/LogoLoader'
import { cn } from '../../lib/cn'

export interface PullToRefreshProps {
  /** Asked for fresh data. Never rejects in practice — anything it throws is swallowed here, since
   *  a failed refresh is not something a gesture should turn into an error screen. */
  onRefresh: () => Promise<void>
  children: ReactNode
}

/** How far the finger has to travel before the release counts as "refresh", in pixels of pull. */
const TRIGGER_AT = 64
/** Where the indicator parks while the read is in flight. */
const REST_AT = 52
/** Pull stops growing here, so a long drag doesn't push the page off the bottom of the screen. */
const MAX_PULL = 96
/** Finger travel is halved on the way to pull distance: the content should feel weighted, and a
 *  1:1 drag makes a 64px threshold trivially easy to cross by accident while scrolling. */
const DAMPING = 0.5
/** Ignored below this, so an ordinary flick down at the top of a list stays an ordinary flick. */
const SLOP = 8
/** A read that answers in 80ms would otherwise flash the spinner and look like nothing happened. */
const MIN_VISIBLE_MS = 500

/** The class ItemDndContext puts on the body for the length of a touch drag. A card being dragged
 *  owns the gesture; this must not also react to it. */
const DRAG_ACTIVE = 'dnd-touch-active'

/** The arc that closes as you pull. Drawn at a fixed 40-unit viewBox and scaled by CSS, so the
 *  stroke stays crisp at any density. */
const RING_RADIUS = 17
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

function isScrollable(element: Element): boolean {
  const style = window.getComputedStyle(element)
  return (
    /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight
  )
}

/**
 * The nearest thing that actually scrolls above `target`, or null if nothing does.
 *
 * Pages here don't agree on who scrolls: most let `<main>` do it, while a folder scrolls an inner
 * pane so its own header can stay put. The gesture has to know which one it is looking at, because
 * "am I at the top?" is the entire question — pulling down halfway through a list must scroll, not
 * refresh.
 */
function scrollParent(target: EventTarget | null, boundary: HTMLElement): HTMLElement | null {
  let node = target instanceof Element ? target : null
  while (node) {
    if (node instanceof HTMLElement && isScrollable(node)) {
      return node
    }
    if (node === boundary) {
      return null
    }
    node = node.parentElement
  }
  return null
}

/**
 * Swipe down at the top of a page to re-read it.
 *
 * Wraps the app's content rather than living on a page, so the gesture exists everywhere the same
 * way — a folder, a note, the task list, the space you're a guest in. What it refreshes is the
 * caller's business; this owns only the gesture and the indicator.
 *
 * Touch only, deliberately. A mouse has no equivalent of "pull past the end", and the desktop case
 * is already covered by the poll and by refreshing when the window regains focus.
 *
 * The listeners are attached by hand instead of through React's props because the move handler has
 * to call `preventDefault()`, and React registers touchmove passively at the root — where that call
 * does nothing at all. Chrome on Android would then run its *own* pull-to-refresh underneath this
 * one and reload the whole page, which is the one outcome this gesture exists to avoid.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  /** True only while a finger is actually moving the content. Everything animates *except* then:
   *  mid-drag the indicator has to sit exactly where the thumb is, and a transition there feels
   *  like lag. On release — settling back, or parking while the read runs — it eases. */
  const [dragging, setDragging] = useState(false)
  // The listeners below are bound once and would close over the first render's `refreshing`. A ref
  // written where the state is written — not during render — is what they can read instead.
  const refreshingRef = useRef(false)

  const run = useCallback(async () => {
    refreshingRef.current = true
    setRefreshing(true)
    setPull(REST_AT)
    const started = Date.now()
    try {
      await onRefresh()
    } catch {
      /* Whatever failed, the page below is still showing the last good answer. */
    }
    const elapsed = Date.now() - started
    if (elapsed < MIN_VISIBLE_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, MIN_VISIBLE_MS - elapsed))
    }
    refreshingRef.current = false
    setRefreshing(false)
    setPull(0)
  }, [onRefresh])

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    let startY = 0
    let scroller: HTMLElement | null = null
    /** Armed: a one-finger touch that began at the top of something. Engaged: it has since moved
     *  down past the slop, so the gesture — not the scroller — owns this touch. */
    let armed = false
    let engaged = false
    /** How far the content is currently pulled. A plain variable rather than the state, because
     *  touchend has to read the value the last touchmove computed, and a state update dispatched
     *  from a native listener is not guaranteed to have been committed by then. */
    let distance = 0

    const release = () => {
      armed = false
      engaged = false
      scroller = null
      distance = 0
      setDragging(false)
    }

    const onStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || document.body.classList.contains(DRAG_ACTIVE)) {
        release()
        return
      }
      const touch = event.touches[0]
      if (!touch) {
        return
      }
      scroller = scrollParent(event.target, host)
      // No scroller at all means a page shorter than the screen, which is as "at the top" as it gets.
      armed = (scroller?.scrollTop ?? 0) <= 0
      engaged = false
      startY = touch.clientY
    }

    const onMove = (event: TouchEvent) => {
      if (!armed || refreshingRef.current) {
        return
      }
      if (document.body.classList.contains(DRAG_ACTIVE)) {
        release()
        setPull(0)
        return
      }
      const touch = event.touches[0]
      if (!touch) {
        return
      }
      const travel = touch.clientY - startY
      if (travel <= 0) {
        // Reversed into an upward scroll. Hand the touch back rather than fighting it.
        if (engaged) {
          setPull(0)
        }
        release()
        return
      }
      // The list may have been scrolled down between touchstart and now (momentum from an earlier
      // flick); pulling then is still scrolling.
      if ((scroller?.scrollTop ?? 0) > 0) {
        release()
        setPull(0)
        return
      }
      if (!engaged && travel < SLOP) {
        return
      }
      if (!engaged) {
        setDragging(true)
      }
      engaged = true
      // Kills the browser's own overscroll — the rubber band on iOS, the page reload on Android.
      event.preventDefault()
      distance = Math.min(MAX_PULL, (travel - SLOP) * DAMPING)
      setPull(distance)
    }

    const onEnd = () => {
      const reached = distance >= TRIGGER_AT
      const wasEngaged = engaged
      release()
      if (!wasEngaged) {
        return
      }
      if (reached) {
        void run()
      } else {
        setPull(0)
      }
    }

    host.addEventListener('touchstart', onStart, { passive: true })
    host.addEventListener('touchmove', onMove, { passive: false })
    host.addEventListener('touchend', onEnd)
    host.addEventListener('touchcancel', onEnd)
    return () => {
      host.removeEventListener('touchstart', onStart)
      host.removeEventListener('touchmove', onMove)
      host.removeEventListener('touchend', onEnd)
      host.removeEventListener('touchcancel', onEnd)
    }
  }, [run])

  const progress = Math.min(1, pull / TRIGGER_AT)
  const armed = progress >= 1
  const settling = !dragging

  return (
    <div ref={hostRef} className="relative h-full">
      {/* Sits above the content and slides in with it, so the page appears to be pulled down off
        * the top of the screen and the indicator to be revealed underneath. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
        style={{
          transform: `translateY(${pull - 46}px)`,
          opacity: pull > 0 ? Math.min(1, progress * 1.4) : 0,
          transition: settling ? 'transform 220ms ease-out, opacity 220ms ease-out' : 'none',
        }}
        aria-hidden={!refreshing}
      >
        <span
          className={cn(
            'relative mt-2 inline-flex h-10 w-10 items-center justify-center rounded-full',
            'bg-[var(--color-surface)] shadow-[var(--shadow-md)]',
            'transition-colors duration-200',
            armed || refreshing ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]',
          )}
          style={{
            // Grows into the gesture, and holds at full size once it means something. Not applied
            // while refreshing, where the badge is parked and the bars carry the motion.
            transform: refreshing ? undefined : `scale(${0.74 + 0.26 * progress})`,
            transition: settling ? 'transform 220ms var(--motion-ease)' : 'none',
          }}
          role={refreshing ? 'status' : undefined}
          aria-label={refreshing ? 'Refreshing' : undefined}
        >
          {/* The pull itself, as an arc closing around the mark. A ring rather than a number
            * because the only thing worth knowing is how much further to go, and it reads at a
            * glance from under a thumb. Every colour is a theme token, so it follows the accent a
            * custom theme sets rather than carrying one of its own. */}
          <svg
            viewBox="0 0 40 40"
            className="absolute inset-0 h-full w-full -rotate-90"
            aria-hidden
          >
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="2"
            />
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              // Full circle while the read is in flight: the arc has done its job, and a frozen
              // three-quarter arc beside playing bars reads as something stuck.
              strokeDashoffset={RING_LENGTH * (refreshing ? 0 : 1 - progress)}
              style={{
                opacity: refreshing ? 0.35 : 1,
                transition: settling ? 'stroke-dashoffset 220ms ease-out' : 'none',
              }}
            />
          </svg>

          {/* The app's own mark, filling as you pull and then playing while it loads — the same
            * animation the splash screen uses, so a refresh looks like this app working rather
            * than like a borrowed spinner. */}
          <LogoLoader
            size="sm"
            progress={refreshing ? undefined : progress}
            className="relative"
          />
        </span>
      </div>

      <div
        className="h-full"
        style={{
          transform: pull > 0 ? `translateY(${pull}px)` : undefined,
          transition: settling ? 'transform 220ms ease-out' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  )
}
