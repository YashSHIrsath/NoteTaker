/**
 * How long until a deadline, said the way the spec asks for it: "2d 4h 31m", then "43m 12s", then
 * "Due now", then "Overdue by 2h 15m".
 *
 * The seconds field is dropped once more than an hour is left. A number that changes sixty times
 * a minute is worth watching when the deadline is minutes away and is pure noise when it is two
 * days away — and it also lets the tick slow down, since nothing on screen changes every second
 * until the last hour.
 */
export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  /** Milliseconds remaining; negative once the deadline has passed. */
  remainingMs: number
  overdue: boolean
}

export function countdownParts(dueMs: number, nowMs: number): CountdownParts {
  const remainingMs = dueMs - nowMs
  const total = Math.floor(Math.abs(remainingMs) / 1000)
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    remainingMs,
    overdue: remainingMs < 0,
  }
}

/** "2d 4h 31m" / "43m 12s" — the largest two-or-three units that carry information. */
export function formatDuration(parts: CountdownParts): string {
  const { days, hours, minutes, seconds } = parts
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

/**
 * The whole line, including the case where there is nothing to count.
 *
 * "Due now" covers the minute either side of the deadline: a countdown that reads "0s remaining"
 * and then "overdue by 3s" is technically right and reads as a stopwatch, which is not what a
 * deadline is.
 */
export function countdownLabel(dueMs: number, nowMs: number): string {
  const parts = countdownParts(dueMs, nowMs)
  if (Math.abs(parts.remainingMs) < 60_000) {
    return 'Due now'
  }
  return parts.overdue
    ? `Overdue by ${formatDuration(parts)}`
    : `${formatDuration(parts)} remaining`
}

/**
 * When a reminder will actually go out.
 *
 * Not countdownLabel with the word "remaining" stripped off, which is what this was: that produced
 * "Sends in Due now" the moment a reminder came within a minute of its slot. A reminder either
 * has time left on it or it is going out, and those are two different sentences.
 */
export function sendLabel(runAtMs: number, nowMs: number): string {
  if (runAtMs - nowMs <= 60_000) {
    return 'Sending now'
  }
  return `Sends in ${formatDuration(countdownParts(runAtMs, nowMs))}`
}

/**
 * How often this countdown needs redrawing.
 *
 * Under an hour the seconds are on screen, so it ticks every second. Above that only the minutes
 * move, and a card that repaints once a second for two days is a battery cost with nothing to
 * show for it.
 */
export function countdownIntervalMs(dueMs: number, nowMs: number): number {
  return Math.abs(dueMs - nowMs) < 3_600_000 ? 1_000 : 30_000
}
