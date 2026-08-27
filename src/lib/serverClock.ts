import { getSupabaseClient } from './supabase'

/**
 * The clock every countdown and every overdue check reads.
 *
 * `Date.now()` is whatever the device thinks the time is, and a phone an hour fast would show a
 * task overdue an hour early — with a red card and a "1h overdue" label, from data that says
 * nothing of the sort. The database is the authority on what time it is, so the app asks it once,
 * keeps the difference, and ticks against that instead.
 *
 * The offset is a single number, not a stream: clocks drift by seconds a day, and a countdown
 * measured in minutes does not need re-syncing. It is refreshed when the tab comes back after
 * being hidden, which is the one case where a device's clock realistically jumps (a laptop waking
 * in another timezone, or a phone that corrected itself overnight).
 */
let offsetMs = 0
let syncing: Promise<void> | null = null

/** Milliseconds to add to the device clock to land on server time. */
export function clockOffsetMs(): number {
  return offsetMs
}

/** Server time, as a millisecond timestamp. Use this instead of `Date.now()` for anything a user
 *  will read as a deadline, a countdown, or an overdue state. */
export function serverNowMs(): number {
  return Date.now() + offsetMs
}

/**
 * Asks the database for the time and records the difference.
 *
 * Half the round trip is subtracted from the reading: the answer describes the moment the query
 * ran, which is roughly halfway between sending and receiving, and on a slow connection ignoring
 * that would bake the whole latency into the offset as permanent skew.
 *
 * Failure is not an error state. An offset of zero is exactly the behaviour the app had before
 * this existed, so a network blip degrades to "trust the device" rather than to a broken clock.
 */
export async function syncServerClock(): Promise<void> {
  if (syncing) {
    return syncing
  }
  const client = getSupabaseClient()
  if (!client) {
    return
  }
  syncing = (async () => {
    try {
      const sentAt = Date.now()
      const { data, error } = await client.rpc('server_now')
      if (error || typeof data !== 'string') {
        return
      }
      const receivedAt = Date.now()
      const serverMs = new Date(data).getTime()
      if (!Number.isFinite(serverMs)) {
        return
      }
      offsetMs = serverMs - (sentAt + (receivedAt - sentAt) / 2)
    } catch {
      /* Keep whatever offset we had; the device clock is the fallback. */
    } finally {
      syncing = null
    }
  })()
  return syncing
}

/** Test seam: lets the lifecycle checks run a fixed skew without a database. */
export function setClockOffsetForTests(ms: number): void {
  offsetMs = ms
}
