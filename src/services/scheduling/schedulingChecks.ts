import type { Reminder, ReminderDraft, Task } from '../../types'
import { countdownLabel, countdownIntervalMs, countdownParts } from '../../lib/countdown'
import { isTaskComplete, lifecycleStyle, taskLifecycle } from '../../lib/taskLifecycle'
import {
  FOLLOW_UP_SUGGESTIONS,
  MAX_OFFSET_MINUTES,
  defaultReminderMessage,
  describeReminder,
  draftFromReminder,
  emptyDraft,
  isPastOneTime,
  isoToLocalInput,
  joinOffset,
  leadTimeSuggestions,
  localInputToIso,
  normalizeDraft,
  splitOffset,
} from '../../lib/reminders'
import { migrateSnapshot } from '../storage/migrate'
import { NOTES_STORAGE_VERSION } from '../storage/types'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Submit project',
    folderId: 'folder-1',
    content: '',
    isImportant: false,
    pinnedScopes: [],
    noteKind: 'note',
    dueAt: null,
    completed: false,
    completedAt: null,
    tags: [],
    color: null,
    gridLayouts: null,
    sortOrder: 0,
    ...overrides,
  }
}

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'reminder-1',
    taskId: 'task-1',
    kind: 'relative',
    message: null,
    isActive: true,
    timezone: 'Asia/Kolkata',
    atUtc: null,
    recurUnit: null,
    recurInterval: null,
    recurWeekday: null,
    recurTime: null,
    anchorDate: null,
    offsetMinutes: 15,
    offsetDirection: 'before',
    nextRunAt: null,
    lastRunAt: null,
    ...overrides,
  }
}

/**
 * The lifecycle ladder, case by case, against the scenarios the feature was specified with.
 *
 * These are the client half of a rule that also exists in SQL (`public.task_lifecycle`). They are
 * written against fixed instants rather than the real clock, because a test that reads
 * `Date.now()` passes or fails depending on when it runs — and the whole point of this ladder is
 * that it doesn't depend on when anyone happens to be looking.
 */
function runLifecycleChecks(): void {
  const now = Date.UTC(2026, 7, 28, 12, 0, 0)

  assert(taskLifecycle(task(), now) === 'note', 'a note with no due date is a note')
  assert(
    taskLifecycle(task({ dueAt: new Date(now + DAY).toISOString() }), now) === 'note',
    'a due date on a note that was never switched to a task is still a note',
  )

  // Case 1 — due tomorrow, completed today.
  assert(
    taskLifecycle(
      task({
        noteKind: 'due_task',
        dueAt: new Date(now + DAY).toISOString(),
        completed: true,
        completedAt: new Date(now).toISOString(),
      }),
      now,
    ) === 'completed_on_time',
    'Case 1: completed before the deadline is on time',
  )

  // Case 2 — deadline passed, nothing done.
  assert(
    taskLifecycle(task({ noteKind: 'due_task', dueAt: new Date(now - HOUR).toISOString() }), now) ===
      'overdue',
    'Case 2: past the deadline and incomplete is overdue',
  )

  // Case 3 — deadline passed, completed two hours later.
  assert(
    taskLifecycle(
      task({
        noteKind: 'due_task',
        dueAt: new Date(now - 3 * HOUR).toISOString(),
        completed: true,
        completedAt: new Date(now - HOUR).toISOString(),
      }),
      now,
    ) === 'completed_late',
    'Case 3: completed after the deadline is late',
  )

  // Case 5 — the browser was shut while the deadline passed. Nothing about the ladder depends on
  // the page having been open, so the very first evaluation after a reload is already 'overdue'.
  const wasUpcoming = task({ noteKind: 'due_task', dueAt: new Date(now + HOUR).toISOString() })
  assert(taskLifecycle(wasUpcoming, now) === 'upcoming', 'Case 5: upcoming before the deadline')
  assert(
    taskLifecycle(wasUpcoming, now + 2 * HOUR) === 'overdue',
    'Case 5: the same untouched row reads as overdue once the clock passes it',
  )

  // Completing exactly on the deadline counts as on time; the boundary belongs to the deadline.
  const due = new Date(now).toISOString()
  assert(
    taskLifecycle(
      task({ noteKind: 'due_task', dueAt: due, completed: true, completedAt: due }),
      now,
    ) === 'completed_on_time',
    'completing exactly at the deadline is on time',
  )

  assert(lifecycleStyle('note') === null, 'a plain note keeps its own colour')
  assert(lifecycleStyle('overdue') !== null, 'a task state has a fixed colour')
  assert(
    lifecycleStyle('completed_on_time')!.card !== lifecycleStyle('completed_late')!.card,
    'on time and late are visibly different states',
  )
  assert(
    isTaskComplete('completed_late') && !isTaskComplete('overdue'),
    'late still counts as complete; overdue does not',
  )
}

/** Case 4 — the live figure, and the shapes it takes on the way down. */
function runCountdownChecks(): void {
  const now = Date.UTC(2026, 7, 28, 12, 0, 0)

  const far = countdownParts(now + 2 * DAY + 4 * HOUR + 31 * 60_000, now)
  assert(far.days === 2 && far.hours === 4 && far.minutes === 31, 'parts split into d/h/m')
  assert(
    countdownLabel(now + 2 * DAY + 4 * HOUR + 31 * 60_000, now) === '2d 4h 31m remaining',
    'Case 4: a distant deadline counts in days',
  )
  assert(
    countdownLabel(now + 43 * 60_000 + 12_000, now) === '43m 12s remaining',
    'Case 4: inside the hour it counts seconds too',
  )
  assert(countdownLabel(now + 30_000, now) === 'Due now', 'the minute around the deadline is "Due now"')
  assert(countdownLabel(now - 30_000, now) === 'Due now', 'and so is the minute just after it')
  assert(
    countdownLabel(now - 2 * HOUR - 15 * 60_000, now) === 'Overdue by 2h 15m',
    'past the deadline it counts up instead',
  )
  assert(
    countdownIntervalMs(now + 5 * DAY, now) > countdownIntervalMs(now + 60_000, now),
    'a distant deadline redraws less often than an imminent one',
  )
}

/**
 * Reminder drafts, and the one rule that keeps a save from being rejected: a row carries exactly
 * one kind's fields. Switching the type in the UI is what would otherwise leave two sets behind.
 */
function runReminderDraftChecks(): void {
  const weekly: ReminderDraft = {
    ...emptyDraft('recurring'),
    recurUnit: 'week',
    recurInterval: 2,
    recurWeekday: 1,
    recurTime: '10:00',
    anchorDate: '2026-08-28',
  }

  const switched = normalizeDraft({ ...weekly, kind: 'one_time', atUtc: '2026-09-02T16:30:00.000Z' })
  assert(
    switched.recurUnit === null && switched.recurInterval === null && switched.recurTime === null,
    'switching a weekly draft to one-time drops every recurrence field',
  )
  assert(switched.atUtc === '2026-09-02T16:30:00.000Z', 'and keeps the instant it switched to')

  const relative = normalizeDraft({ ...weekly, kind: 'relative', offsetMinutes: 60 })
  assert(
    relative.atUtc === null && relative.recurUnit === null && relative.offsetDirection === 'before',
    'switching to relative leaves only an offset, defaulting to before the deadline',
  )

  const daily = normalizeDraft({ ...weekly, recurUnit: 'day' })
  assert(daily.recurWeekday === null, 'a daily series carries no weekday')

  const clamped = normalizeDraft({ ...weekly, recurInterval: 9999 })
  assert(clamped.recurInterval === 365, 'an out-of-range interval is clamped, not rejected')
  const negative = normalizeDraft({ ...emptyDraft('relative'), offsetMinutes: -5 })
  assert(negative.offsetMinutes === 0, 'a negative offset becomes "at the due time"')

  const blank = normalizeDraft({ ...emptyDraft('one_time'), message: '   ' })
  assert(blank.message === null, 'a whitespace-only message is no message')
  const long = normalizeDraft({ ...emptyDraft('one_time'), message: 'x'.repeat(900) })
  assert(long.message!.length === 500, 'a message is trimmed to what the column accepts')

  assert(
    emptyDraft('relative').offsetMinutes === 15 && emptyDraft('recurring').recurTime === '09:00',
    'new drafts start on sensible defaults',
  )

  const roundTrip = draftFromReminder(reminder({ kind: 'recurring', recurUnit: 'week', recurInterval: 2, recurWeekday: 1, recurTime: '10:00', anchorDate: '2026-08-28', offsetMinutes: null, offsetDirection: null }))
  assert(roundTrip.recurWeekday === 1 && roundTrip.recurInterval === 2, 'an existing reminder edits as itself')
}

/** Case 6 and 7 — how the list describes what it will do. */
function runReminderLabelChecks(): void {
  assert(describeReminder(reminder({ offsetMinutes: 1440 })) === '1 day before due', 'Case 6: 1 day before')
  assert(describeReminder(reminder({ offsetMinutes: 60 })) === '1 hour before due', 'Case 6: 1 hour before')
  assert(describeReminder(reminder({ offsetMinutes: 15 })) === '15 minutes before due', 'Case 6: 15 minutes before')
  assert(
    describeReminder(reminder({ offsetMinutes: 30, offsetDirection: 'after' })) === '30 minutes after due',
    'after-due reminders read as after',
  )
  assert(describeReminder(reminder({ offsetMinutes: 0 })) === 'At the due time', 'a zero offset is the due time')

  assert(
    describeReminder(
      reminder({ kind: 'recurring', recurUnit: 'day', recurInterval: 1, recurTime: '09:00', offsetMinutes: null, offsetDirection: null }),
    ) === 'Every day at 9:00 AM',
    'daily reads as every day',
  )
  assert(
    describeReminder(
      reminder({ kind: 'recurring', recurUnit: 'day', recurInterval: 2, recurTime: '09:00', offsetMinutes: null, offsetDirection: null }),
    ) === 'Every 2 days at 9:00 AM',
    'Case 7: every N days says N',
  )
  assert(
    describeReminder(
      reminder({ kind: 'recurring', recurUnit: 'week', recurInterval: 1, recurWeekday: 1, recurTime: '10:00', offsetMinutes: null, offsetDirection: null }),
    ) === 'Every Monday at 10:00 AM',
    'weekly names the day',
  )
  assert(
    describeReminder(
      reminder({ kind: 'recurring', recurUnit: 'week', recurInterval: 2, recurWeekday: 1, recurTime: '10:00', offsetMinutes: null, offsetDirection: null }),
    ) === 'Every 2 weeks on Monday at 10:00 AM',
    'every N weeks names both',
  )
}

/**
 * Local wall-clock in, absolute instant out, and back again.
 *
 * The round trip is what matters: a `datetime-local` input has no zone, the column is a
 * timestamptz, and the bug this guards against is the classic one — building the ISO string by
 * hand or via toISOString on a date-only value, which shifts the day for anyone whose offset
 * pushes them over midnight.
 */
function runTimezoneChecks(): void {
  const value = '2026-08-30T18:30'
  const iso = localInputToIso(value)
  assert(iso !== null, 'a local datetime becomes an instant')
  assert(isoToLocalInput(iso) === value, 'and reads back as the same wall-clock the user typed')

  const parsed = new Date(iso!)
  assert(
    parsed.getFullYear() === 2026 && parsed.getMonth() === 7 && parsed.getDate() === 30,
    'the local calendar date survives the conversion in this runtime zone',
  )
  assert(parsed.getHours() === 18 && parsed.getMinutes() === 30, 'and so does the local time')

  assert(localInputToIso('') === null, 'an empty field is no deadline')
  assert(localInputToIso('not-a-date') === null, 'garbage is no deadline either')
  assert(isoToLocalInput(null) === '', 'and a null instant is an empty field')
}

/** The stored-document migration: existing notes must come through unchanged. */
function runStorageMigrationChecks(): void {
  const migrated = migrateSnapshot({
    version: 10,
    folders: [],
    tasks: [
      { id: 'a', title: 'Plain', dueAt: null, status: null, isPinned: true },
      { id: 'b', title: 'Had a deadline', dueAt: '2026-08-30T18:00:00.000Z', status: 'pending' },
      { id: 'c', title: 'Was ongoing', dueAt: '2026-08-30T18:00:00.000Z', status: 'ongoing' },
      { id: 'd', title: 'Was complete', dueAt: '2026-08-30T18:00:00.000Z', status: 'complete' },
    ],
    subtasks: [],
    tags: [],
    uiState: {},
  }) as { version: number; tasks: Array<Record<string, unknown>> }

  assert(
    migrated.version === NOTES_STORAGE_VERSION,
    'the document reaches whatever the current version is',
  )
  const [plain, hadDeadline, wasOngoing, wasComplete] = migrated.tasks

  assert(plain.noteKind === 'note' && plain.dueAt === null, 'a note without a deadline stays a note')
  assert(plain.completed === false, 'and is not complete')
  assert(
    hadDeadline.noteKind === 'due_task' && hadDeadline.completed === false,
    'a note that already had a deadline becomes a due-date task',
  )
  assert(
    wasOngoing.noteKind === 'due_task' && wasOngoing.completed === false,
    "'ongoing' is read as not yet done",
  )
  assert(
    wasComplete.completed === true && wasComplete.completedAt === null,
    'a completed task stays completed, with no invented completion time',
  )
  assert(
    (plain as { title: string }).title === 'Plain',
    'nothing else about a task is touched by the migration',
  )

  // Pinning became per-listing. One flag used to mean "pinned everywhere", so that is what it has
  // to become — reading it as "pinned nowhere" would silently unpin every card someone had pinned.
  assert(
    Array.isArray(plain.pinnedScopes) &&
      (plain.pinnedScopes as string[]).length === 3,
    'a pinned note comes through pinned in all three listings',
  )
  assert(
    Array.isArray(hadDeadline.pinnedScopes) &&
      (hadDeadline.pinnedScopes as string[]).length === 0,
    'and an unpinned one is pinned nowhere',
  )
}

/**
 * Typed offsets: any amount, any unit, in either direction.
 *
 * The old picker was a fixed menu ending at "1 week", so these are the cases that used not to be
 * expressible at all.
 */
function runOffsetChecks(): void {
  assert(joinOffset(90, 'days') === 129600, '90 days is a storable offset')
  assert(joinOffset(2, 'weeks') === 20160, 'weeks convert to minutes')
  assert(joinOffset(1, 'hours') === 60, 'so do hours')
  assert(joinOffset(45, 'minutes') === 45, 'minutes pass through')

  // Round-tripping matters: the field has to show back what was typed, not the raw minute count.
  for (const [amount, unit] of [
    [90, 'days'],
    [2, 'weeks'],
    [3, 'hours'],
    [45, 'minutes'],
  ] as const) {
    const split = splitOffset(joinOffset(amount, unit))
    assert(
      split.amount === amount && split.unit === unit,
      `${amount} ${unit} reads back as itself`,
    )
  }

  assert(splitOffset(1440).unit === 'days', '1440 minutes reads back as 1 day, not 1440 minutes')
  assert(splitOffset(10080).unit === 'weeks', 'and 10080 as 1 week')
  assert(splitOffset(0).amount === 0, 'zero is the due time itself')

  assert(joinOffset(999999, 'weeks') === MAX_OFFSET_MINUTES, 'an absurd offset clamps to the cap')
  assert(joinOffset(-5, 'days') === 0, 'a negative offset clamps to the due time')
  assert(
    normalizeDraft({ ...emptyDraft('relative'), offsetMinutes: MAX_OFFSET_MINUTES }).offsetMinutes ===
      MAX_OFFSET_MINUTES,
    'the cap itself is allowed through, matching the database constraint',
  )
  assert(
    describeReminder({ ...reminder(), offsetMinutes: 129600, offsetDirection: 'after' }) ===
      '90 days after due',
    'a long offset describes itself in days',
  )
}

/**
 * A one-time reminder set for a moment that has already gone.
 *
 * The picker has no seconds, so choosing the current minute when it is already part-way through
 * produces a time in the past — which the scheduler reads as due and sends immediately.
 */
function runPastReminderChecks(): void {
  const now = Date.UTC(2026, 7, 28, 1, 55, 30)

  const past = { ...emptyDraft('one_time'), atUtc: new Date(Date.UTC(2026, 7, 28, 1, 53)).toISOString() }
  assert(isPastOneTime(past, now), 'a time two minutes ago is in the past')

  const thisMinute = { ...emptyDraft('one_time'), atUtc: new Date(Date.UTC(2026, 7, 28, 1, 55)).toISOString() }
  assert(
    isPastOneTime(thisMinute, now),
    'the current minute counts as past once its seconds have started — this is the case the picker makes easy to hit',
  )

  const future = { ...emptyDraft('one_time'), atUtc: new Date(Date.UTC(2026, 7, 28, 1, 56)).toISOString() }
  assert(!isPastOneTime(future, now), 'the next minute is fine')

  assert(!isPastOneTime(emptyDraft('recurring'), now), 'a repeating reminder is never "past"')
  assert(!isPastOneTime(emptyDraft('relative'), now), 'nor is one measured from a deadline')
}

/** The wording the email will carry, shown in the field rather than generated out of sight. */
function runMessageChecks(): void {
  const before = { ...emptyDraft('relative'), offsetMinutes: 15, offsetDirection: 'before' as const }
  assert(
    defaultReminderMessage(before, 'Submit project') === 'Submit project is due in 15 minutes.',
    'a before-due reminder describes the lead time',
  )
  assert(
    defaultReminderMessage({ ...before, offsetDirection: 'after' }, 'Submit project') ===
      'Submit project was due 15 minutes ago.',
    'an after-due reminder says so in the past tense',
  )
  assert(
    defaultReminderMessage({ ...before, offsetMinutes: 0 }, 'Submit project') ===
      'Submit project is due now.',
    'a zero offset says the deadline is now',
  )
  assert(
    defaultReminderMessage({ ...before, offsetMinutes: 1440 }, 'Submit project') ===
      'Submit project is due in 1 day.',
    'the sentence follows the offset, so changing the schedule rewrites it',
  )
  assert(
    defaultReminderMessage(before, '   ') === 'this note is due in 15 minutes.',
    'an untitled note still reads as a sentence',
  )
}

/**
 * The rule the dialog's Done button and its write path both enforce: a due-date task always has a
 * deadline.
 *
 * `datetime-local` reports an empty string until *both* halves are filled, so a field showing a
 * date and "--:--" is indistinguishable from a blank one — which is exactly how a task with no
 * deadline was getting saved. These pin the parsing that decision rests on.
 */
function runDueCompletenessChecks(): void {
  const complete = (value: string) => Boolean(localInputToIso(value))

  assert(complete('2026-08-29T09:00'), 'a full date and time is complete')
  assert(!complete(''), 'an untouched field is not')
  assert(!complete('2026-08-29'), 'a date with no time is not a deadline')
  assert(!complete('2026-08-29T'), 'nor is a half-typed one')
  assert(!complete('T09:00'), 'nor is a time with no date')

  // The state the guard exists to prevent: kind says task, deadline says nothing. Anything that
  // reaches this combination reads as a plain note, which is the safe way to be wrong.
  assert(
    taskLifecycle(task({ noteKind: 'due_task', dueAt: null }), Date.now()) === 'note',
    'a due-date task with no deadline has no task lifecycle to show',
  )
}

/**
 * The offers made once a deadline has already gone.
 *
 * "15 minutes before" cannot be answered then, so these are anchored to now instead. Every one has
 * to land in the future — an offer that resolves to the past would send the instant it was
 * accepted, which is precisely the trap this whole set of prompts exists to avoid.
 */
function runFollowUpChecks(): void {
  // A Friday evening, deliberately: late enough that "this evening" has already gone, and a
  // weekday that makes "next Monday" a short hop rather than a week.
  const friday = new Date(2026, 7, 28, 19, 30, 0)

  for (const suggestion of FOLLOW_UP_SUGGESTIONS) {
    const at = suggestion.at(friday)
    assert(
      at.getTime() > friday.getTime(),
      `follow-up "${suggestion.label}" lands in the future`,
    )
  }

  const byKey = (key: string) => FOLLOW_UP_SUGGESTIONS.find((entry) => entry.key === key)!

  const hour = byKey('hour').at(friday)
  assert(hour.getHours() === 20 && hour.getMinutes() === 30, '"In 1 hour" is exactly an hour on')

  // 19:30 is past six, so there is no evening left to point at.
  const evening = byKey('evening').at(friday)
  assert(
    evening.getDate() === 29 && evening.getHours() === 18,
    '"This evening" rolls to tomorrow once the evening has gone',
  )
  const morning = new Date(2026, 7, 28, 9, 0, 0)
  assert(
    byKey('evening').at(morning).getDate() === 28,
    'and stays today when asked in the morning',
  )

  const tomorrow = byKey('tomorrow').at(friday)
  assert(
    tomorrow.getDate() === 29 && tomorrow.getHours() === 9,
    '"Tomorrow, 9 AM" is the next day at nine',
  )

  // 2026-08-28 is a Friday, so the next Monday is the 31st.
  const monday = byKey('monday').at(friday)
  assert(
    monday.getDay() === 1 && monday.getDate() === 31 && monday.getHours() === 9,
    '"Next Monday" finds the coming Monday',
  )
  // Asked on a Monday it must mean the following one, never twenty minutes ago.
  const onAMonday = new Date(2026, 7, 31, 14, 0, 0)
  const fromMonday = byKey('monday').at(onAMonday)
  assert(
    fromMonday.getDate() === 7 && fromMonday.getMonth() === 8,
    '"Next Monday" asked on a Monday means the one after',
  )
}

/**
 * The lead times offered for a deadline, which depend entirely on how far away it is.
 *
 * The bug these exist for: a fixed "15 minutes before" on something due in five minutes is a
 * reminder ten minutes in the past, and the scheduler sends those at once.
 */
function runLeadTimeChecks(): void {
  const MIN = 60_000

  // Every offer, at any distance, has to leave time on the clock.
  for (const remaining of [3 * MIN, 20 * MIN, 90 * MIN, 8 * 60 * MIN, 8 * 24 * 60 * MIN]) {
    for (const lead of leadTimeSuggestions(remaining)) {
      assert(
        remaining - lead * MIN > MIN,
        `a ${lead}m lead still leaves time when ${remaining / MIN}m remain`,
      )
      assert(
        lead * MIN <= remaining / 2,
        `a ${lead}m lead is at most halfway when ${remaining / MIN}m remain`,
      )
    }
  }

  assert(
    leadTimeSuggestions(5 * MIN).length === 0,
    'five minutes out, no lead time is worth offering — only the due time itself is left',
  )
  assert(
    !leadTimeSuggestions(20 * MIN).includes(15),
    'twenty minutes out, "15 minutes before" is past halfway and is not offered',
  )
  assert(leadTimeSuggestions(20 * MIN).includes(10), 'but ten minutes before is fine there')

  const week = leadTimeSuggestions(8 * 24 * 60 * MIN)
  assert(week.length === 3, 'a distant deadline offers a full set')
  assert(
    week[0] > week[1] && week[1] > week[2],
    'and reads largest first — a day out, then an hour, then minutes',
  )
  assert(
    !week.includes(10080),
    '"1 week before" is not offered on something due in eight days: it would arrive immediately',
  )
}

export function runSchedulingChecks(): void {
  runLifecycleChecks()
  runCountdownChecks()
  runReminderDraftChecks()
  runReminderLabelChecks()
  runOffsetChecks()
  runPastReminderChecks()
  runMessageChecks()
  runDueCompletenessChecks()
  runFollowUpChecks()
  runLeadTimeChecks()
  runTimezoneChecks()
  runStorageMigrationChecks()
}
