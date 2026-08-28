import type { OffsetDirection, RecurUnit, Reminder, ReminderDraft } from '../types'

/** 0 = Sunday, matching `Date.getDay()` and Postgres `dow` — the same index the column stores. */
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/**
 * The units a relative offset can be typed in.
 *
 * The offset is stored as a plain minute count, so a unit is only a multiplier — which is exactly
 * why months and years are not on this list. A month is 28 to 31 days and a year is 365 or 366,
 * so "2 months before" would have to pick one and be wrong the rest of the time. Weeks are the
 * largest span that is the same length every time; 100 days is `100` and `days`, and a decade is
 * reachable in weeks.
 */
export const OFFSET_UNITS = [
  { key: 'minutes', label: 'minutes', minutes: 1 },
  { key: 'hours', label: 'hours', minutes: 60 },
  { key: 'days', label: 'days', minutes: 1440 },
  { key: 'weeks', label: 'weeks', minutes: 10080 },
] as const

export type OffsetUnit = (typeof OFFSET_UNITS)[number]['key']

/** Ten years, matching the reminders_offset_range constraint. Clamped here so a typo is corrected
 *  in the field rather than rejected by the database after a round trip. */
export const MAX_OFFSET_MINUTES = 5_256_000

/**
 * Where to put a reminder when the deadline is already behind you.
 *
 * "15 minutes before" is meaningless once the moment has gone, so a passed deadline needs offers
 * anchored to *now* instead — the question stops being "warn me in time" and becomes "when should
 * I be made to look at this again". These are absolute instants, which is why they are one-time
 * reminders rather than offsets.
 *
 * Each computes from a passed-in `now` rather than reading the clock itself, so the same list can
 * be tested at a fixed instant.
 */
export interface FollowUpSuggestion {
  key: string
  label: string
  at: (now: Date) => Date
}

/** The next occurrence of a weekday, strictly in the future, at a whole hour. Asking for Monday on
 *  a Monday means the Monday after this one — "next Monday" never means "twenty minutes ago". */
function nextWeekdayAt(now: Date, weekday: number, hour: number): Date {
  const date = new Date(now)
  date.setHours(hour, 0, 0, 0)
  const shift = (weekday - date.getDay() + 7) % 7
  date.setDate(date.getDate() + (shift === 0 ? 7 : shift))
  return date
}

export const FOLLOW_UP_SUGGESTIONS: FollowUpSuggestion[] = [
  {
    key: 'hour',
    label: 'In 1 hour',
    at: (now) => {
      const date = new Date(now.getTime() + 3_600_000)
      date.setSeconds(0, 0)
      return date
    },
  },
  {
    key: 'evening',
    label: 'This evening',
    at: (now) => {
      const date = new Date(now)
      date.setHours(18, 0, 0, 0)
      // Past six already: there is no evening left to point at, so it becomes tomorrow's.
      if (date.getTime() <= now.getTime()) {
        date.setDate(date.getDate() + 1)
      }
      return date
    },
  },
  {
    key: 'tomorrow',
    label: 'Tomorrow, 9 AM',
    at: (now) => {
      const date = new Date(now)
      date.setDate(date.getDate() + 1)
      date.setHours(9, 0, 0, 0)
      return date
    },
  },
  { key: 'monday', label: 'Next Monday, 9 AM', at: (now) => nextWeekdayAt(now, 1, 9) },
]

/**
 * Which lead times are worth offering for a deadline this far away.
 *
 * A fixed list of "15 min / 1 hour / 1 day before" is wrong the moment the deadline is close: on
 * something due in five minutes, every one of those resolves to a time already past, and the
 * scheduler reads a past reminder as overdue and sends it immediately. The offer has to come from
 * the gap, not from a constant.
 *
 * Two rules decide what survives. A lead has to leave real time on the clock — hence the minute of
 * headroom, so tapping it doesn't produce a send that is already due. And it has to be no more
 * than halfway to the deadline, because a "1 week before" on something due in eight days is a
 * reminder that arrives while you are still reading this panel, which is not a warning.
 *
 * Returned largest first, which is how they read as a sequence: a day out, then an hour, then
 * fifteen minutes.
 */
const LEAD_CANDIDATE_MINUTES = [5, 10, 15, 30, 60, 180, 360, 720, 1440, 4320, 10080]

export function leadTimeSuggestions(remainingMs: number, limit = 3): number[] {
  const halfway = remainingMs / 2
  const viable = LEAD_CANDIDATE_MINUTES.filter((minutes) => {
    const lead = minutes * 60_000
    return lead <= halfway && remainingMs - lead > 60_000
  })
  return viable.slice(-limit).reverse()
}

/** One tap for the lead times people actually reach for. Everything else is typed. */
export const OFFSET_PRESETS: Array<{ minutes: number; label: string }> = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 1440, label: '1 day' },
]

/** A minute count as the largest unit that divides it evenly, so 1440 reads back as "1 day"
 *  rather than "1440 minutes" — the field shows what was typed, not what was stored. */
export function splitOffset(minutes: number): { amount: number; unit: OffsetUnit } {
  const safe = Math.max(0, Math.round(minutes))
  for (const unit of [...OFFSET_UNITS].reverse()) {
    if (safe >= unit.minutes && safe % unit.minutes === 0) {
      return { amount: safe / unit.minutes, unit: unit.key }
    }
  }
  return { amount: safe, unit: 'minutes' }
}

export function joinOffset(amount: number, unit: OffsetUnit): number {
  const multiplier = OFFSET_UNITS.find((entry) => entry.key === unit)?.minutes ?? 1
  const total = Math.round(amount) * multiplier
  return Math.min(MAX_OFFSET_MINUTES, Math.max(0, Number.isFinite(total) ? total : 0))
}

/**
 * When the soonest of these reminders will fire, or null if none of them will.
 *
 * Only reminders that are switched on and actually scheduled count: a paused one and a spent one
 * both have nothing coming, and saying otherwise on a card would be a promise the sweep won't keep.
 */
/**
 * The reminders that are still going to send something.
 *
 * `isActive` alone is not that question. A one-time reminder that has already fired stays active
 * for good — its next run is simply null — so counting active reminders left a bell on the card
 * forever, advertising a reminder that had come and gone. What a card is reporting is what is
 * still coming.
 */
export function scheduledReminders(reminders: Reminder[]): Reminder[] {
  return reminders.filter((reminder) => reminder.isActive && reminder.nextRunAt !== null)
}

export function nextReminderAt(reminders: Reminder[]): string | null {
  let soonest: string | null = null
  for (const reminder of reminders) {
    if (!reminder.isActive || !reminder.nextRunAt) {
      continue
    }
    if (!soonest || new Date(reminder.nextRunAt).getTime() < new Date(soonest).getTime()) {
      soonest = reminder.nextRunAt
    }
  }
  return soonest
}

export function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** `HH:MM` in the browser's own zone — the format the `time` column and `<input type="time">`
 *  both speak. */
export function localTimeValue(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `YYYY-MM-DD` in the browser's own zone. Built by hand rather than via toISOString, which would
 *  convert to UTC first and hand back yesterday's date for anyone east of Greenwich in the
 *  evening. */
export function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * A `<input type="datetime-local">` value as an absolute instant, or null if it isn't one.
 *
 * The shape is checked before parsing, and that is not belt-and-braces — it is the whole point.
 * `new Date('2026-08-29')` is valid and yields midnight *UTC*, while `new Date('2026-08-29T09:00')`
 * yields that time *locally*: the same function, two different timezone rules, chosen by whether
 * a time happens to be present. So a half-filled field didn't fail, it silently became midnight in
 * the wrong zone and saved as a real deadline.
 *
 * Requiring the full shape makes an incomplete entry a non-value, which is what every caller
 * already treats as "no deadline yet".
 */
const LOCAL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

export function localInputToIso(value: string): string | null {
  if (!LOCAL_DATETIME_PATTERN.test(value)) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function isoToLocalInput(iso: string | null): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${localDateValue(date)}T${localTimeValue(date)}`
}

/** "1 day", "15 minutes" — matches the wording the reminder email uses for the same offset. */
export function humanizeMinutes(minutes: number): string {
  if (minutes <= 0) {
    return 'at the due time'
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} day${days === 1 ? '' : 's'}`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

/** `09:00` as `9:00 AM`, for reading rather than editing. */
export function formatClockTime(value: string | null): string {
  if (!value) {
    return ''
  }
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value
  }
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return `${display}:${pad(minutes)} ${suffix}`
}

/**
 * The one-line description shown in the reminder list.
 *
 * Deliberately the schedule and not the message: the list answers "when will this reach me", and
 * a custom message can say anything at all — including nothing about timing. The message shows
 * underneath it where there is one.
 */
export function describeReminder(reminder: Reminder): string {
  if (reminder.kind === 'relative' && reminder.offsetMinutes !== null) {
    if (reminder.offsetMinutes === 0) {
      return 'At the due time'
    }
    const side = reminder.offsetDirection === 'after' ? 'after' : 'before'
    return `${humanizeMinutes(reminder.offsetMinutes)} ${side} due`
  }

  if (reminder.kind === 'recurring') {
    const time = formatClockTime(reminder.recurTime)
    const every = reminder.recurInterval ?? 1
    if (reminder.recurUnit === 'week') {
      const day = WEEKDAYS[reminder.recurWeekday ?? 1]
      return every === 1 ? `Every ${day} at ${time}` : `Every ${every} weeks on ${day} at ${time}`
    }
    return every === 1 ? `Every day at ${time}` : `Every ${every} days at ${time}`
  }

  if (reminder.atUtc) {
    return new Date(reminder.atUtc).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  return 'One-time reminder'
}

/**
 * The sentence a reminder says when nobody has written one.
 *
 * Put into the field as real, editable text rather than left as a greyed placeholder: a
 * placeholder is something you have to replace, and the point here is that the wording is already
 * right and you only change it if you want to. What gets stored is what you can see.
 *
 * It stays in step with the schedule until it is edited by hand — change "15 minutes" to "1 day"
 * and the sentence follows, because until you have touched it, it is a description rather than
 * a message.
 */
export function defaultReminderMessage(draft: ReminderDraft, taskTitle: string): string {
  const title = taskTitle.trim() || 'this note'

  if (draft.kind === 'relative' && draft.offsetMinutes !== null) {
    if (draft.offsetMinutes === 0) {
      return `${title} is due now.`
    }
    const lead = humanizeMinutes(draft.offsetMinutes)
    return draft.offsetDirection === 'after'
      ? `${title} was due ${lead} ago.`
      : `${title} is due in ${lead}.`
  }

  if (draft.kind === 'recurring') {
    return `Reminder: ${title}.`
  }

  return `Reminder: ${title}.`
}

/**
 * A one-time reminder set for a moment that has already gone.
 *
 * Worth catching in the field rather than letting through: the scheduler treats a past instant as
 * "overdue, send immediately", so the reminder arrives within the minute. That is almost never
 * what someone means, and it is very easy to do by accident — the picker has no seconds, so
 * choosing the current minute when it is already half over is a time in the past.
 */
export function isPastOneTime(draft: ReminderDraft, nowMs: number): boolean {
  if (draft.kind !== 'one_time' || !draft.atUtc) {
    return false
  }
  const at = new Date(draft.atUtc).getTime()
  return Number.isFinite(at) && at <= nowMs
}

/** A fresh reminder of each kind, with defaults worth accepting unchanged. */
export function emptyDraft(kind: Reminder['kind'], now = new Date()): ReminderDraft {
  const timezone = currentTimezone()
  const base: ReminderDraft = {
    kind,
    message: null,
    isActive: true,
    timezone,
    atUtc: null,
    recurUnit: null,
    recurInterval: null,
    recurWeekday: null,
    recurTime: null,
    anchorDate: null,
    offsetMinutes: null,
    offsetDirection: null,
  }

  if (kind === 'relative') {
    return { ...base, offsetMinutes: 15, offsetDirection: 'before' }
  }
  if (kind === 'recurring') {
    return {
      ...base,
      recurUnit: 'day',
      recurInterval: 1,
      recurWeekday: null,
      recurTime: '09:00',
      anchorDate: localDateValue(now),
    }
  }
  // One-time: tomorrow at 9, because "tomorrow morning" is what a reminder set on a whim means
  // far more often than "in five minutes".
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return { ...base, atUtc: tomorrow.toISOString() }
}

export function draftFromReminder(reminder: Reminder): ReminderDraft {
  return {
    kind: reminder.kind,
    message: reminder.message,
    isActive: reminder.isActive,
    timezone: reminder.timezone,
    atUtc: reminder.atUtc,
    recurUnit: reminder.recurUnit,
    recurInterval: reminder.recurInterval,
    recurWeekday: reminder.recurWeekday,
    recurTime: reminder.recurTime,
    anchorDate: reminder.anchorDate,
    offsetMinutes: reminder.offsetMinutes,
    offsetDirection: reminder.offsetDirection,
  }
}

/**
 * Forces a draft into the shape its own kind allows, blanking every field belonging to the others.
 *
 * The database has a CHECK that rejects a row carrying two kinds' worth of fields, and switching
 * the dropdown from Weekly to One-time is exactly how a draft ends up holding both. Normalising
 * here means that switch can't produce a save that fails — and it means the constraint stays a
 * backstop rather than something users meet.
 */
export function normalizeDraft(draft: ReminderDraft): ReminderDraft {
  const message = draft.message?.trim() ? draft.message.trim().slice(0, 500) : null
  const timezone = draft.timezone || currentTimezone()

  if (draft.kind === 'one_time') {
    return {
      ...draft,
      message,
      timezone,
      atUtc: draft.atUtc,
      recurUnit: null,
      recurInterval: null,
      recurWeekday: null,
      recurTime: null,
      anchorDate: null,
      offsetMinutes: null,
      offsetDirection: null,
    }
  }

  if (draft.kind === 'recurring') {
    const unit: RecurUnit = draft.recurUnit === 'week' ? 'week' : 'day'
    return {
      ...draft,
      message,
      timezone,
      atUtc: null,
      recurUnit: unit,
      // Clamped to the column's own range so a pasted or spun-up number can't fail the save.
      recurInterval: Math.min(365, Math.max(1, Math.round(draft.recurInterval ?? 1))),
      recurWeekday: unit === 'week' ? draft.recurWeekday ?? 1 : null,
      recurTime: draft.recurTime ?? '09:00',
      anchorDate: draft.anchorDate ?? localDateValue(new Date()),
      offsetMinutes: null,
      offsetDirection: null,
    }
  }

  const direction: OffsetDirection = draft.offsetDirection === 'after' ? 'after' : 'before'
  return {
    ...draft,
    message,
    timezone,
    atUtc: null,
    recurUnit: null,
    recurInterval: null,
    recurWeekday: null,
    recurTime: null,
    anchorDate: null,
    offsetMinutes: Math.min(MAX_OFFSET_MINUTES, Math.max(0, Math.round(draft.offsetMinutes ?? 15))),
    offsetDirection: direction,
  }
}
