import type { Task, TaskGridLayout } from '../types'

/**
 * Geometry for the resizable task canvas.
 *
 * One layout, in one set of units, at every screen width. An earlier version stored a
 * twelve-column layout and rescaled it per breakpoint; on a phone that turned every card into a
 * single column — four hairline strips side by side — and an edit made there was scaled back up
 * and written over the real arrangement. Positions are now width-independent: what changes with
 * the screen is the smallest a card is *allowed* to be, not where it sits.
 */

/**
 * The canvas is always this many columns.
 *
 * 24 rather than the more familiar 12 so the "cards per row" setting means exactly what it says:
 * 24 divides evenly by 1, 2, 3, 4, 6, 8 and 12, and 5 rounds to a width that still fits 4 across.
 * At 12 columns a setting of 5 or 8 collapsed to the same 2-column minimum, so picking 8 quietly
 * gave you 6. The finer columns also make dragging and resizing snap in smaller steps, which is
 * the difference between placing a card and approximately placing it.
 */
export const GRID_COLS = 24

/** The widths that tile 24 exactly. A card's minimum is always one of these. */
const COLUMN_DIVISORS = [1, 2, 3, 4, 6, 8, 12, 24]

/** Height of one grid row, in px, and the gap between cells. */
export const GRID_ROW_HEIGHT = 28
export const GRID_MARGIN: [number, number] = [12, 12]

/** Roughly the height the old fixed-size cards had: 7 rows plus their gaps ≈ 268px. */
export const DEFAULT_H = 7
/** Below this a card shows a title and nothing else, which is not worth a cell. */
export const MIN_H = 4

/**
 * The narrowest a card may be, given how many should fit across a row.
 *
 * This is what the "cards per row" setting means: at 2 a card can never be narrower than half the
 * canvas, at 4 never narrower than a quarter. It is a floor, not a fixed width — a card can always
 * be pulled wider, up to the full canvas.
 */
export function minWidthFor(cardsPerRow: number): number {
  const ideal = GRID_COLS / cardsPerRow
  // Snapped to a divisor of the canvas, not just rounded. A unit that divides 24 exactly means any
  // run of cards tiles a row with nothing left over, which is what lets rows fill without ever
  // stretching a card the user didn't touch.
  return COLUMN_DIVISORS.reduce((best, size) =>
    Math.abs(size - ideal) < Math.abs(best - ideal) ? size : best,
  )
}

/** Every width a card may have: whole multiples of the minimum, never a partial unit. */
export function snapWidth(width: number, minWidth: number): number {
  const units = Math.max(1, Math.round(width / minWidth))
  return Math.min(GRID_COLS, units * minWidth)
}

export interface GridItemLayout extends TaskGridLayout {
  i: string
  minW: number
  minH: number
  maxW: number
}

/**
 * The layout react-grid-layout renders: cards placed left to right, each in the first row with
 * room for it.
 *
 * Two rules, and they are the ones that kept getting broken.
 *
 * A card's size is nobody's business but its own. Resizing one card must never change the width of
 * another. An earlier version filled short rows by sharing the leftover columns among that row's
 * cards, which meant dragging one card silently resized its neighbours — the exact thing this
 * must not do. Rows are filled by *moving* cards now, never by stretching them.
 *
 * A gap gets filled if anything can fill it. Placement is first-fit rather than strictly
 * sequential: a later card that fits the space left in an earlier row moves up into it instead of
 * starting a new row and leaving a hole floating. Nothing is ever placed further right than it has
 * to be.
 *
 * Widths are whole multiples of the minimum (see snapWidth), so a run of cards tiles a row exactly
 * and these two rules don't fight each other.
 */
export function buildGridLayout(tasks: Task[], cardsPerRow: number): GridItemLayout[] {
  const minW = minWidthFor(cardsPerRow)

  interface Row {
    cards: GridItemLayout[]
    used: number
    height: number
  }
  const rows: Row[] = []

  // Pass one: assign each card to the first row with horizontal room for it.
  //
  // Horizontal room is the only test. An earlier version also refused a card that was taller than
  // the row, on the theory that it would hang over the row below — which is why shrinking one card
  // failed to pull the card under it up into the space that had just opened: the space was there,
  // but the row was "too short" to accept it. A row simply grows to its tallest card instead, and
  // pass two pushes everything below down to suit.
  for (const task of tasks) {
    const stored = task.gridLayout
    // Clamped up to the current minimum as well as down to the canvas: the minimum tightens when
    // the setting changes or the window narrows, and a card left under it would be stuck.
    const w = snapWidth(Math.min(GRID_COLS, Math.max(minW, Math.round(stored?.w ?? minW))), minW)
    const h = Math.max(MIN_H, Math.round(stored?.h ?? DEFAULT_H))

    let row = rows.find((candidate) => candidate.used + w <= GRID_COLS)
    if (!row) {
      row = { cards: [], used: 0, height: 0 }
      rows.push(row)
    }

    row.cards.push({
      i: task.id,
      x: row.used,
      y: 0,
      w,
      h,
      minW,
      minH: MIN_H,
      // "Full width max" — a card can always be stretched right across the canvas.
      maxW: GRID_COLS,
    })
    row.used += w
    row.height = Math.max(row.height, h)
  }

  // Pass two: stack the rows. Heights are only final now — a card added to row 1 late in pass one
  // can have made it taller than it was when row 2 was started.
  const out: GridItemLayout[] = []
  let y = 0
  for (const row of rows) {
    for (const card of row.cards) {
      card.y = y
      out.push(card)
    }
    y += row.height
  }

  return out
}

/** True when two layouts describe the same cell, so a no-op drag doesn't trigger a save. */
export function sameLayout(a: TaskGridLayout | null, b: TaskGridLayout | null): boolean {
  if (a === null || b === null) {
    return a === b
  }
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}
