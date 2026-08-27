import { useEffect, useState } from 'react'
import { serverNowMs, syncServerClock } from '../lib/serverClock'

/**
 * One clock for the whole page.
 *
 * Every card with a deadline needs the current time, and a `setInterval` inside each of them would
 * mean forty timers waking forty components on forty slightly different schedules — and forty
 * separate renders per second on a busy list. There is one timer here; components subscribe to it.
 *
 * The tick also re-syncs against the server when the tab comes back from being hidden. A laptop
 * that slept through a deadline wakes up with a stale clock and a card that still says "upcoming",
 * which is exactly the case the spec calls out: the correct state has to be there on return, not
 * a refresh later.
 */
type Subscriber = (nowMs: number) => void

const subscribers = new Set<Subscriber>()
let timer: ReturnType<typeof setInterval> | null = null
let visibilityBound = false

/** One second. Fast enough for the last-hour countdown, and the only rate anything here needs —
 *  a card counting in days simply renders the same string on most ticks. */
const TICK_MS = 1_000

function publish(): void {
  const now = serverNowMs()
  for (const subscriber of subscribers) {
    subscriber(now)
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState !== 'visible') {
    return
  }
  // Coming back from a sleeping tab: re-read the server clock before telling anyone the time, so
  // a device whose clock drifted (or jumped a timezone) doesn't paint a wrong state first.
  void syncServerClock().then(publish)
  publish()
}

function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber)
  if (!timer) {
    timer = setInterval(publish, TICK_MS)
  }
  if (!visibilityBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
    visibilityBound = true
  }
  return () => {
    subscribers.delete(subscriber)
    if (subscribers.size === 0 && timer) {
      clearInterval(timer)
      timer = null
      if (visibilityBound) {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        visibilityBound = false
      }
    }
  }
}

/**
 * Server time in milliseconds, re-rendering the caller as it advances.
 *
 * `enabled` is how a card with no deadline opts out entirely: most notes are plain notes, and they
 * have no reason to re-render on a clock at all.
 */
export function useServerNow(enabled = true): number {
  const [now, setNow] = useState(() => serverNowMs())

  useEffect(() => {
    if (!enabled) {
      return
    }
    setNow(serverNowMs())
    return subscribe(setNow)
  }, [enabled])

  return now
}

/** How coarse the filtering clock is. Half a minute: the longest a task can look wrong for. */
const COARSE_STEP_MS = 30_000

/**
 * The same clock, but only moving once every half minute.
 *
 * A page that *filters* by lifecycle needs the time too, and reading useServerNow for it would
 * re-render the whole list — grid canvas, forty cards and all — once a second, to change nothing
 * on all but one tick in thirty. What a filter actually needs is to notice a task crossing its
 * deadline reasonably promptly, so this rounds down to a bucket and only re-renders when the
 * bucket changes. Countdowns keep using useServerNow; they are the thing that genuinely changes
 * every second.
 *
 * The value it returns is up to COARSE_STEP_MS behind real time, which is the price of not
 * re-rendering: a task can sit in "Not due yet" for up to half a minute past its deadline.
 */
export function useServerNowCoarse(enabled = true): number {
  const [bucket, setBucket] = useState(() => Math.floor(serverNowMs() / COARSE_STEP_MS))

  useEffect(() => {
    if (!enabled) {
      return
    }
    setBucket(Math.floor(serverNowMs() / COARSE_STEP_MS))
    return subscribe((now) => {
      const next = Math.floor(now / COARSE_STEP_MS)
      setBucket((current) => (current === next ? current : next))
    })
  }, [enabled])

  return bucket * COARSE_STEP_MS
}
