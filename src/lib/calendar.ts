/**
 * The arithmetic behind the date and time pickers.
 *
 * Kept out of the components entirely, because every bug a hand-built calendar has is in here rather
 * than in the markup: a grid that drops the 31st, a "next month" that lands on the 31st of a month
 * with 30 days, a `min` comparison that rejects the very day it should allow because one side of it
 * still carries a time.
 *
 * Everything is local time, deliberately. These pickers speak the same value format the native
 * `<input type="datetime-local">` did — `YYYY-MM-DDTHH:MM`, in the browser's own zone — so every
 * caller's existing parsing, validation and storage keeps working untouched. Which is also why
 * nothing here goes near toISOString: that converts to UTC first, and would hand back yesterday's
 * date for anyone east of Greenwich in the evening.
 */

/** The value shape the pickers emit and accept, matching the native input they replace. */
export const LOCAL_DATETIME_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const LOCAL_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_TIME_SHAPE = /^\d{2}:\d{2}$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYY-MM-DD` for a local date. */
export function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `HH:MM` for a local time. */
export function toTimeValue(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `YYYY-MM-DDTHH:MM` for a local instant. */
export function toLocalValue(date: Date): string {
  return `${toDateValue(date)}T${toTimeValue(date)}`
}

/**
 * A picker value as a local Date, or null.
 *
 * Accepts a date on its own as well as a full instant, because a value can arrive from elsewhere in
 * that shape — the native input allowed it — and the calendar still has a month to open on. A
 * date-only value reads as midnight *locally*, which is the one thing `new Date('2026-08-29')` gets
 * wrong: that string is parsed as UTC while `'2026-08-29T09:00'` is parsed locally, so the same
 * function silently applies two different timezone rules depending on whether a time is present.
 * Both are built by hand here for that reason.
 */
export function parseLocalValue(value: string): Date | null {
  const trimmed = value.trim()
  const [datePart, timePart] = trimmed.split('T')
  if (!datePart || !LOCAL_DATE_SHAPE.test(datePart)) {
    return null
  }
  const [year, month, day] = datePart.split('-').map(Number)
  let hour = 0
  let minute = 0
  if (timePart !== undefined) {
    const time = timePart.slice(0, 5)
    if (!LOCAL_TIME_SHAPE.test(time)) {
      return null
    }
    const [h, m] = time.split(':').map(Number)
    hour = h!
    minute = m!
  }
  const date = new Date(year!, month! - 1, day!, hour, minute, 0, 0)
  // Rejects the impossible rather than letting it roll over: `new Date(2026, 1, 31)` is 3 March, so
  // a hand-typed or corrupted "2026-02-31" would silently become a different day.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month! - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/** `HH:MM` as minutes past midnight, or null. */
export function parseTimeValue(value: string): { hour: number; minute: number } | null {
  const time = value.trim().slice(0, 5)
  if (!LOCAL_TIME_SHAPE.test(time)) {
    return null
  }
  const [hour, minute] = time.split(':').map(Number)
  if (hour! > 23 || minute! > 59) {
    return null
  }
  return { hour: hour!, minute: minute! }
}

/** Midnight on the same day. The unit every date comparison here is made in. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * The first of the month, `delta` months away.
 *
 * Anchored to the 1st before shifting, which is the whole trick: stepping from 31 January by one
 * month gives 31 February, which JavaScript rolls forward to 2 or 3 March — so "next month" from a
 * long month skips the short one entirely. Every caller here only wants the month, so the day is
 * discarded first and cannot misbehave.
 */
export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0)
}

export function addDays(date: Date, delta: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + delta,
    date.getHours(),
    date.getMinutes(),
    0,
    0,
  )
}

/** Which day the weeks start on. 1 = Monday, which is what en-GB and most of the app's formatting
 *  assume; 0 would be Sunday. */
export const WEEK_STARTS_ON = 1

/**
 * Six weeks of days covering a month, as a flat list of 42.
 *
 * Always six rows, never five-or-six. A grid that changes height as you page through months makes
 * the panel jump — and worse, moves the buttons under the pointer between one click and the next.
 * The leading and trailing days belong to the neighbouring months and are marked as such by the
 * caller comparing `getMonth()`.
 */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0, 0)
  const lead = (first.getDay() - WEEK_STARTS_ON + 7) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead, 0, 0, 0, 0)
  return Array.from({ length: 42 }, (_, index) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 0, 0, 0, 0),
  )
}

/**
 * Short weekday names in the viewer's locale, in the order the grid uses them.
 *
 * Measured from a known Sunday — 7 January 2024 — rather than from today, so the offsets mean the
 * same thing whatever day this runs on. Trimmed to two letters: three ("Mon") does not fit a 34px
 * cell at the size the rest of the panel is set in.
 */
export function weekdayLabels(): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, 7 + ((index + WEEK_STARTS_ON) % 7))
      .toLocaleDateString(undefined, { weekday: 'short' })
      .slice(0, 2),
  )
}

/** The month heading — "August 2026". */
export function monthLabel(month: Date): string {
  return month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** The trigger's own label. Short, because it sits in a field. */
export function formatLocalValue(value: string): string {
  const date = parseLocalValue(value)
  if (!date) {
    return ''
  }
  const now = new Date()
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** `HH:MM` as people read it — 24h or 12h, whichever the locale uses. */
export function formatTimeValue(value: string): string {
  const parsed = parseTimeValue(value)
  if (!parsed) {
    return ''
  }
  return new Date(2024, 0, 1, parsed.hour, parsed.minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Whether a day may be chosen, given a `min` that may carry a time.
 *
 * Compared at day resolution on purpose. A `min` of "today at 14:00" must not grey out today — the
 * time columns are what refuse 09:00, and a calendar that disabled the current day would leave
 * somebody unable to pick this afternoon. The instant-level check is `isBeforeMin`.
 */
export function isDayBeforeMin(day: Date, min: string | undefined): boolean {
  if (!min) {
    return false
  }
  const floor = parseLocalValue(min)
  return floor ? startOfDay(day).getTime() < startOfDay(floor).getTime() : false
}

/** Whether a chosen instant is earlier than `min`. */
export function isBeforeMin(value: string, min: string | undefined): boolean {
  if (!min) {
    return false
  }
  const chosen = parseLocalValue(value)
  const floor = parseLocalValue(min)
  return Boolean(chosen && floor && chosen.getTime() < floor.getTime())
}

/**
 * The time a freshly picked date should carry.
 *
 * A picker that emitted a date with no time would reproduce the native input's worst habit: a
 * half-filled field that parses as midnight and saves as a real deadline nobody chose. So picking a
 * day always produces a complete instant — the time already in the field if there is one, and
 * otherwise the next whole hour, which is a defensible guess and never in the past.
 */
export function defaultTimeFor(existing: string, now: Date = new Date()): { hour: number; minute: number } {
  const current = parseLocalValue(existing)
  if (current && existing.includes('T')) {
    return { hour: current.getHours(), minute: current.getMinutes() }
  }
  // Late in the evening the next whole hour is tomorrow, and returning 00:00 would put a deadline
  // picked for *today* in the past before anyone touched the time column. Nine in the morning is the
  // guess then — the same hour the recurring reminders default to.
  const hour = now.getHours() + 1
  return hour > 23 ? { hour: 9, minute: 0 } : { hour, minute: 0 }
}

/** Combines a day and a time into one picker value. */
export function withTime(day: Date, time: { hour: number; minute: number }): string {
  return toLocalValue(
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.hour, time.minute, 0, 0),
  )
}

/* ------------------------------------------------------------------ the dial
 *
 * The time is chosen on a clock face, which means angles. All of it is here rather than in the
 * component for the usual reason: an off-by-one in the trigonometry is invisible in a screenshot and
 * obvious in an assertion.
 *
 * A grid of buttons came first and could not express 1:44 — five-minute steps are fine for a
 * reminder and useless for a deadline somebody actually looked at a clock for. A dial has sixty
 * positions and costs no more room than twelve.
 */

/**
 * Degrees clockwise from twelve o'clock, for a point measured from the dial's centre.
 *
 * Two corrections to a plain atan2, both easy to get wrong. atan2 measures from the *positive x
 * axis* — three o'clock — so ninety degrees is added to put zero at the top. And screen y grows
 * downward, which already makes atan2 run clockwise, so no sign flip is wanted: adding one would
 * turn the dial into a mirror image that reads correctly at 12 and 6 and nowhere else.
 */
export function pointAngle(dx: number, dy: number): number {
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90
  return ((degrees % 360) + 360) % 360
}

/**
 * The nearest position on a dial of `steps` positions, for an angle.
 *
 * Rounded, not floored: a floor puts the boundary at the number itself, so aiming at "3" and landing
 * a degree early gives 2. Modulo at the end because rounding 359° on a 12-step dial gives 12, which
 * is position 0.
 */
export function angleToStep(degrees: number, steps: number): number {
  const size = 360 / steps
  return Math.round((((degrees % 360) + 360) % 360) / size) % steps
}

/** Where a dial position sits, in degrees clockwise from twelve. */
export function stepAngle(step: number, steps: number): number {
  return (step * 360) / steps
}

/** A point on the dial, in SVG coordinates. `radius` from the centre at `angle` degrees. */
export function dialPoint(
  centre: number,
  radius: number,
  degrees: number,
): { x: number; y: number } {
  const radians = ((degrees - 90) * Math.PI) / 180
  return {
    x: centre + radius * Math.cos(radians),
    y: centre + radius * Math.sin(radians),
  }
}

/** The hour as the twelve-hour dial numbers it: 0 and 12 both sit at the top, shown as 12. */
export function dialHour(hour: number): number {
  return hour % 12
}

/** A dial position and a meridiem back to a 24-hour hour. */
export function hourFromDial(position: number, pm: boolean): number {
  return (position % 12) + (pm ? 12 : 0)
}

/** "1:44 pm", or "13:44" — whichever the locale writes. */
export function formatClockTime(hour: number, minute: number): string {
  return new Date(2024, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
