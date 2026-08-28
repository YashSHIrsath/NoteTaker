import {
  addMonths,
  angleToStep,
  dialHour,
  dialPoint,
  hourFromDial,
  pointAngle,
  stepAngle,
  defaultTimeFor,
  isBeforeMin,
  isDayBeforeMin,
  monthGrid,
  parseLocalValue,
  parseTimeValue,
  sameDay,
  toDateValue,
  toLocalValue,
  weekdayLabels,
  WEEK_STARTS_ON,
  withTime,
} from '../../lib/calendar'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * Parsing, which is where a hand-built picker silently corrupts a date.
 *
 * The one that matters most is the timezone split. `new Date('2026-08-29')` is midnight *UTC* while
 * `new Date('2026-08-29T09:00')` is that time *locally* — the same constructor, two different rules,
 * chosen by whether a time happens to be present. Every value here is assembled field by field for
 * that reason, so both shapes mean the same thing.
 */
function checkParsing(): void {
  const withT = parseLocalValue('2026-08-29T14:30')
  assert(withT !== null, 'a full instant parses')
  assert(withT!.getFullYear() === 2026, 'the year is the one written')
  assert(withT!.getMonth() === 7, 'and August is month 7, not 8')
  assert(withT!.getDate() === 29, 'and the day is not shifted by a zone')
  assert(withT!.getHours() === 14 && withT!.getMinutes() === 30, 'and the local time is local')

  const dateOnly = parseLocalValue('2026-08-29')
  assert(dateOnly !== null, 'a date on its own parses, because a value can arrive that way')
  assert(
    dateOnly!.getDate() === 29 && dateOnly!.getHours() === 0,
    'as local midnight on that day — not the UTC midnight new Date() would give it',
  )

  // The round trip has to be exact, or a value would drift every time a panel opened and closed.
  assert(toLocalValue(withT!) === '2026-08-29T14:30', 'and it survives being written back out')
  assert(toDateValue(withT!) === '2026-08-29', 'the date half on its own too')

  // Rolling over is the silent failure: new Date(2026, 1, 31) is 3 March.
  assert(parseLocalValue('2026-02-31T09:00') === null, 'an impossible day is rejected, not rolled')
  assert(parseLocalValue('2026-13-01T09:00') === null, 'and so is an impossible month')
  assert(parseLocalValue('') === null, 'nothing is not a date')
  assert(parseLocalValue('2026-08-29T25:00') === null, 'nor is a 25th hour')
  assert(parseLocalValue('not a date') === null, 'nor is prose')

  assert(parseTimeValue('09:05')?.hour === 9, 'a time parses')
  assert(parseTimeValue('09:05')?.minute === 5, 'both halves of it')
  assert(parseTimeValue('24:00') === null, 'and 24:00 is not a time of day')
  assert(parseTimeValue('9:5') === null, 'nor is an unpadded one, which the column never emits')
}

/**
 * Month arithmetic, which is the other place these things break.
 *
 * Stepping a month from a 31-day month is the classic: 31 January plus one month is 31 February,
 * which JavaScript rolls forward into March — so "next month" from a long month skips the short one
 * entirely. addMonths discards the day first, which is why it cannot.
 */
function checkMonths(): void {
  const jan31 = new Date(2026, 0, 31)
  const next = addMonths(jan31, 1)
  assert(next.getMonth() === 1, 'next month from 31 January is February, not March')
  assert(next.getDate() === 1, 'anchored to the first, because only the month is wanted')

  const mar31 = new Date(2026, 2, 31)
  assert(addMonths(mar31, -1).getMonth() === 1, 'and back from 31 March is February')

  assert(addMonths(new Date(2026, 11, 15), 1).getFullYear() === 2027, 'December steps into January')
  assert(addMonths(new Date(2026, 0, 15), -1).getFullYear() === 2025, 'and January back into December')
}

/**
 * The grid: always 42 cells, always starting on the configured weekday, always containing every day
 * of the month it is for.
 *
 * February 2026 starts on a Sunday, which with Monday-first weeks is the worst case — a full seven
 * leading days. A grid that sized itself to the month would be five rows here and six elsewhere, and
 * the panel would change height as you paged, moving buttons under the pointer.
 */
function checkGrid(): void {
  for (const month of [new Date(2026, 1, 1), new Date(2026, 7, 1), new Date(2024, 1, 1)]) {
    const grid = monthGrid(month)
    assert(grid.length === 42, 'six weeks, whatever the month')
    assert(
      grid[0]!.getDay() === WEEK_STARTS_ON,
      'and the first cell is always the same weekday, so the headings never lie',
    )

    // Every day of the month appears exactly once. The 31st going missing is the bug this catches.
    const inMonth = grid.filter((day) => day.getMonth() === month.getMonth())
    const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    assert(
      inMonth.length === lastOfMonth,
      `every day of the month is in the grid (${inMonth.length} of ${lastOfMonth})`,
    )
    assert(inMonth[0]!.getDate() === 1, 'starting at the 1st')
    assert(inMonth[inMonth.length - 1]!.getDate() === lastOfMonth, 'and ending at the last')

    // Consecutive, with no gap or repeat at a month boundary — the grid is built by adding days to
    // one start, so a leap-year February is not a special case.
    for (let index = 1; index < grid.length; index += 1) {
      const gap = grid[index]!.getTime() - grid[index - 1]!.getTime()
      assert(gap > 0, 'the grid runs forwards')
      assert(gap <= 25 * 60 * 60 * 1000, 'one day at a time, allowing for a DST shift')
    }
  }

  // 29 February 2024 exists and must be reachable.
  assert(
    monthGrid(new Date(2024, 1, 1)).some((day) => day.getMonth() === 1 && day.getDate() === 29),
    'a leap day is in its own month grid',
  )

  assert(weekdayLabels().length === 7, 'seven headings')
  assert(new Set(weekdayLabels()).size === 7, 'and no two the same, or the columns would be unreadable')
}

/**
 * The floor, which is compared at two different resolutions on purpose.
 *
 * A `min` of "today at 14:00" must not grey out today: the time columns are what refuse 09:00, and a
 * calendar that disabled the current day would leave somebody unable to pick this afternoon at all.
 */
function checkMinimum(): void {
  const min = '2026-08-29T14:00'

  assert(!isDayBeforeMin(new Date(2026, 7, 29), min), 'the floor’s own day stays selectable')
  assert(isDayBeforeMin(new Date(2026, 7, 28), min), 'the day before it does not')
  assert(!isDayBeforeMin(new Date(2026, 7, 30), min), 'and later days do')
  assert(!isDayBeforeMin(new Date(2020, 0, 1), undefined), 'no floor disables nothing')

  // And the instant-level check, which is the one that catches "today, but earlier".
  assert(isBeforeMin('2026-08-29T09:00', min), 'a time earlier that same day is before the floor')
  assert(!isBeforeMin('2026-08-29T14:00', min), 'the floor itself is not before itself')
  assert(!isBeforeMin('2026-08-29T14:01', min), 'and a minute later is fine')
  assert(!isBeforeMin('', min), 'no value is not a violation — it is simply not a value')
}

/**
 * Picking a day always produces a complete instant.
 *
 * This is the habit the native input had that the replacement must not: a date with no time parses
 * as midnight and saves as a real deadline nobody chose. So a day picked into an empty field brings a
 * time with it, and that time is never in the past by construction.
 */
function checkCompleteness(): void {
  const day = new Date(2026, 7, 29)

  assert(
    withTime(day, { hour: 14, minute: 30 }) === '2026-08-29T14:30',
    'a day and a time make one value',
  )
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(withTime(day, { hour: 9, minute: 0 })),
    'padded, in the shape every caller already parses',
  )

  // An existing time is kept — changing the day must not silently reset the hour.
  assert(defaultTimeFor('2026-08-29T14:30').hour === 14, 'an existing time is kept')
  assert(defaultTimeFor('2026-08-29T14:30').minute === 30, 'to the minute')

  // An empty field gets the next whole hour...
  const morning = new Date(2026, 7, 29, 10, 17)
  assert(defaultTimeFor('', morning).hour === 11, 'an empty field gets the next whole hour')
  assert(defaultTimeFor('', morning).minute === 0, 'on the hour')

  // ...except late in the evening, where the next whole hour is tomorrow. Returning 00:00 there
  // would put a deadline picked for *today* in the past before anyone touched the time column.
  const lateNight = new Date(2026, 7, 29, 23, 40)
  assert(defaultTimeFor('', lateNight).hour === 9, 'and 09:00 when the next hour is past midnight')

  // A date-only value counts as having no time, so it is completed rather than trusted as midnight.
  assert(defaultTimeFor('2026-08-29', morning).hour === 11, 'a date with no time is completed')
}

/** sameDay ignores the clock, which is what every comparison in the grid depends on. */
function checkSameDay(): void {
  assert(
    sameDay(new Date(2026, 7, 29, 0, 0), new Date(2026, 7, 29, 23, 59)),
    'the same day at either end of it',
  )
  assert(!sameDay(new Date(2026, 7, 29, 23, 59), new Date(2026, 7, 30, 0, 0)), 'but not across midnight')
  assert(!sameDay(new Date(2026, 7, 29), new Date(2025, 7, 29)), 'nor the same date a year apart')
}

/**
 * The clock dial, which is trigonometry and therefore silently wrong rather than visibly wrong.
 *
 * Two corrections to a plain atan2 have to hold or the whole face is a mirror or a quarter-turn out:
 * atan2 measures from three o'clock, so ninety degrees is added to put zero at the top; and screen y
 * grows downward, which already makes atan2 run clockwise, so no sign flip is wanted. A dial that is
 * a quarter-turn out still reads correctly at exactly one position, which is how it gets shipped.
 */
function checkDial(): void {
  // Straight up is zero, then clockwise. dy is negative upward, because screen y grows down.
  assert(pointAngle(0, -100) === 0, 'twelve o’clock is zero degrees')
  assert(pointAngle(100, 0) === 90, 'three o’clock is ninety — clockwise, not anticlockwise')
  assert(pointAngle(0, 100) === 180, 'six o’clock is a hundred and eighty')
  assert(pointAngle(-100, 0) === 270, 'and nine o’clock is two hundred and seventy')

  // The dial reduces an angle to a position. Rounded, so aiming at a number and landing a degree
  // early still gives that number — a floor would put the boundary on the number itself.
  assert(angleToStep(0, 12) === 0, 'zero degrees is the twelve position')
  assert(angleToStep(90, 12) === 3, 'ninety degrees is three')
  assert(angleToStep(89, 12) === 3, 'and a degree short of it is still three')
  assert(angleToStep(275, 12) === 9, 'as is a degree past nine')
  assert(angleToStep(359, 12) === 0, 'and the wrap lands on twelve, not on a thirteenth position')

  // Sixty positions is the whole point: 1:44 has to be expressible, and 44 is 264 degrees.
  assert(angleToStep(264, 60) === 44, 'forty-four minutes is reachable on the minute dial')
  assert(angleToStep(6, 60) === 1, 'and so is one')
  assert(angleToStep(354, 60) === 59, 'and fifty-nine')
  assert(angleToStep(357, 60) === 0, 'with the wrap landing on zero')

  // Round trip: every position must map to an angle that maps back to itself. This is the assertion
  // that catches an off-by-one in either direction, at every position rather than at the four
  // cardinals a hand-check would look at.
  for (let minute = 0; minute < 60; minute += 1) {
    assert(
      angleToStep(stepAngle(minute, 60), 60) === minute,
      `minute ${minute} survives the trip to an angle and back`,
    )
  }
  for (let position = 0; position < 12; position += 1) {
    assert(
      angleToStep(stepAngle(position, 12), 12) === position,
      `hour position ${position} survives it too`,
    )
  }

  // Where a label or a hand tip is drawn. Twelve is straight up from the centre, three is due right.
  const twelve = dialPoint(100, 80, 0)
  assert(Math.abs(twelve.x - 100) < 0.001, 'the twelve label sits on the vertical centre line')
  assert(Math.abs(twelve.y - 20) < 0.001, 'and eighty above the middle — a smaller y, because up')
  const three = dialPoint(100, 80, 90)
  assert(Math.abs(three.x - 180) < 0.001, 'the three label sits eighty to the right')
  assert(Math.abs(three.y - 100) < 0.001, 'on the horizontal centre line')

  /*
   * Twelve-hour dial, twenty-four-hour value.
   *
   * The trap is midnight and noon: both sit at the top of the dial, and both are written 12. Getting
   * this wrong shifts an entire half of the day by twelve hours, which is the worst possible bug in a
   * deadline picker and looks completely fine on screen.
   */
  assert(dialHour(0) === 0, 'midnight is the top of the dial')
  assert(dialHour(12) === 0, 'and so is noon')
  assert(dialHour(13) === 1, 'one in the afternoon is the one position')
  assert(dialHour(23) === 11, 'and eleven at night the eleven position')

  assert(hourFromDial(0, false) === 0, 'the top of the dial in the morning is midnight')
  assert(hourFromDial(0, true) === 12, 'and in the afternoon is noon')
  assert(hourFromDial(1, true) === 13, 'one pm is thirteen')
  assert(hourFromDial(11, true) === 23, 'eleven pm is twenty-three')
  assert(hourFromDial(11, false) === 11, 'and eleven am is eleven')

  // And the round trip through the dial keeps every hour of the day intact.
  for (let hour = 0; hour < 24; hour += 1) {
    assert(
      hourFromDial(dialHour(hour), hour >= 12) === hour,
      `hour ${hour} survives being shown on a twelve-hour dial`,
    )
  }
}

export function runCalendarChecks(): void {
  checkParsing()
  checkMonths()
  checkGrid()
  checkMinimum()
  checkCompleteness()
  checkSameDay()
  checkDial()
}
