import type { Task, TaskGridLayout, TaskGridPlacement, TaskGridScope } from '../types'

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
 * The number has one job: every "cards per row" setting has to divide it exactly, or the setting
 * cannot mean what it says. 120 divides by 1, 2, 3, 4, 5, 6, 8, 10 and 12.
 *
 * It was 24, which covers 1, 2, 3, 4 and 6 but not 5 — and a setting of 5 asked for a minimum
 * width of 4.8 columns, snapped to the nearest whole divisor (4), and 4 columns is a sixth of 24.
 * So picking 5 laid out 6, silently and identically to picking 6. A count that does not divide
 * the canvas cannot be honoured by widening the cards either, because a card's width is nobody's
 * business but its own (see buildGridLayout) — the row would simply leave the remainder empty.
 */
export const GRID_COLS = 120

/**
 * The column count `w` is stored in. Bumped when GRID_COLS changes, because a stored width is a
 * number of columns and means nothing without knowing how many there were.
 *
 * Version 1 is the 24-column canvas, and is what every width written before this is in. Reads go
 * through placementForScope, which scales those up; writes always stamp the current version. The
 * scale is exact — 120 is 5 x 24 — so nothing is lost or rounded on the way across.
 */
export const PLACEMENT_VERSION = 2
const LEGACY_GRID_COLS = 24



/** Every listing that keeps its own arrangement. Iterated when reading a stored value back, so a
 *  scope added to the type is read as soon as it is added here. */
export const GRID_SCOPES: readonly TaskGridScope[] = ['folder', 'tasks', 'important']

/**
 * What this listing remembers about a card, in today's units.
 *
 * The single read path for a stored placement, so the version conversion lives in one place and
 * nothing downstream has to know the canvas ever had a different number of columns. Heights are
 * in rows, which have not changed, and orders are indices — only the width is affected.
 */
export function placementForScope(task: Task, scope: TaskGridScope): TaskGridPlacement | null {
  const stored = task.gridLayouts?.[scope]
  if (!stored) {
    return null
  }
  if ((stored.v ?? 1) >= PLACEMENT_VERSION) {
    return stored
  }
  return {
    ...stored,
    v: PLACEMENT_VERSION,
    w: stored.w === undefined ? undefined : stored.w * (GRID_COLS / LEGACY_GRID_COLS),
  }
}

/**
 * The order a listing shows its cards in: the one the reader dragged them into, then everything
 * they haven't touched, in the order the listing handed them over.
 *
 * Dragging is expressed as an order rather than as a free (x, y), and that is what keeps the two
 * rules below intact. A dropped card is re-flowed through the same first-fit packer as everything
 * else, so it can't land in a hole, overlap a neighbour, or leave a gap behind it — and the
 * arrangement stays the same arrangement at every screen width, which a stored pixel position
 * could not be.
 */
function inDisplayOrder(tasks: Task[], scope: TaskGridScope): Task[] {
  const order = new Map<string, number>()
  for (const task of tasks) {
    const stored = placementForScope(task, scope)?.order
    if (typeof stored === 'number') {
      order.set(task.id, stored)
    }
  }
  if (order.size === 0) {
    return tasks
  }
  // A copy: the array belongs to the caller, and a view that re-sorted its own task list in place
  // would reorder every other view holding the same array.
  //
  // Compared rather than subtracted, so "no order" can be a missing entry instead of a sentinel
  // number — and because Array#sort is stable, untouched cards keep the order they arrived in.
  return [...tasks].sort((a, b) => {
    const left = order.get(a.id)
    const right = order.get(b.id)
    if (left === right) {
      return 0
    }
    if (left === undefined) {
      return 1
    }
    if (right === undefined) {
      return -1
    }
    return left - right
  })
}

/**
 * The order to write back after a drag, read off the layout the grid just settled into.
 *
 * Reading order — down the rows, then across each one — is what the reader sees, so it is what
 * gets stored. Every card in the listing is written, because an order is only meaningful relative
 * to the others; sizes are deliberately not, so a card that has never been resized keeps taking
 * its width from the "cards per row" setting.
 */
export function orderFromLayout(
  layout: readonly { i: string; x: number; y: number }[],
): Map<string, number> {
  const sorted = [...layout].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
  return new Map(sorted.map((item, index) => [item.i, index]))
}

/** The widths that tile the canvas exactly. A card's minimum is always one of these. */
const COLUMN_DIVISORS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 60, 120]

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
  // Every count the picker can offer divides the canvas exactly, so this is normally the answer
  // outright. The snap below is the guard for anything that doesn't: a width that divides the
  // canvas means a run of cards tiles a row with nothing left over, which is what lets rows fill
  // without ever stretching a card the user didn't touch.
  if (Number.isInteger(ideal)) {
    return ideal
  }
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
export function buildGridLayout(
  tasks: Task[],
  cardsPerRow: number,
  scope: TaskGridScope,
): GridItemLayout[] {
  const minW = minWidthFor(cardsPerRow)

  interface Row {
    cards: GridItemLayout[]
    used: number
    height: number
  }
  const rows: Row[] = []
  const ordered = inDisplayOrder(tasks, scope)

  // Pass one: assign each card to the first row with horizontal room for it.
  //
  // Horizontal room is the only test. An earlier version also refused a card that was taller than
  // the row, on the theory that it would hang over the row below — which is why shrinking one card
  // failed to pull the card under it up into the space that had just opened: the space was there,
  // but the row was "too short" to accept it. A row simply grows to its tallest card instead, and
  // pass two pushes everything below down to suit.
  for (const task of ordered) {
    const stored = placementForScope(task, scope)
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

/** True when a stored placement already says what is about to be written, so a gesture that ends
 *  where it started — or a re-render handing back the arrangement it was given — doesn't save. */
export function samePlacement(a: TaskGridPlacement | null, b: TaskGridPlacement): boolean {
  if (a === null) {
    return false
  }
  // The version is deliberately not compared: `a` has already been converted by
  // placementForScope, so an old row and a new write can agree on every real field. Treating the
  // stamp alone as a change would rewrite every card on the first load after a version bump.
  return a.w === b.w && a.h === b.h && a.order === b.order
}
