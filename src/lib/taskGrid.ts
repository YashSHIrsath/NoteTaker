import { compareTasksBySortOrder } from './tasks'
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

/** Whether this note is pinned in the listing being drawn. Pinning is per-listing — see
 *  Task.pinnedScopes — so every caller has to say which listing it is asking about. */
export function isPinnedIn(task: Task, scope: TaskGridScope): boolean {
  return task.pinnedScopes.includes(scope)
}

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
 * The order this listing shows one card in, or null when it has none that applies.
 *
 * `folder` is one scope shared by every folder view. That is right for size and wrong for order —
 * see TaskGridPlacement.orderFolderId — so a folder-scope order is honoured only in the folder it
 * was minted in. An order with no folder recorded predates that rule and is read as belonging
 * wherever the note is now, which is exactly what it was already being used as.
 */
export function storedOrder(task: Task, scope: TaskGridScope): number | null {
  const placement = placementForScope(task, scope)
  if (!placement || typeof placement.order !== 'number') {
    return null
  }
  if (
    scope === 'folder' &&
    placement.orderFolderId !== undefined &&
    placement.orderFolderId !== task.folderId
  ) {
    return null
  }
  return placement.order
}

/**
 * The order a listing shows its cards in: the one the reader dragged them into, then everything
 * they haven't touched, in flow order.
 *
 * Total, and independent of the array it was handed. That is the whole point of it. Cards with no
 * stored order used to keep the position the array arrived in, and the flat listings hand over
 * whatever Postgres returned for `ORDER BY sort_order` — a column that restarts at 0 in every
 * folder, so almost every row is tied. Ties have no order, and rewriting a row is enough to change
 * which tied row comes back first: saving a card's *size* could reshuffle the page on the next
 * load, and did.
 *
 * So the comparison ends at the id, which is unique and never changes. Nothing above it can leave
 * two cards indistinguishable.
 */
export function inDisplayOrder(tasks: Task[], scope: TaskGridScope): Task[] {
  // A copy: the array belongs to the caller, and a view that re-sorted its own task list in place
  // would reorder every other view holding the same array.
  return [...tasks].sort((a, b) => compareForDisplay(a, b, scope))
}

function compareForDisplay(a: Task, b: Task, scope: TaskGridScope): number {
  const left = storedOrder(a, scope)
  const right = storedOrder(b, scope)
  if (left !== right) {
    // An arranged card comes before one nobody has arranged, whatever its index.
    if (left === null) {
      return 1
    }
    if (right === null) {
      return -1
    }
    return left - right
  }
  return compareTasksBySortOrder(a, b)
}

/**
 * The cards one listing can ever show, given a card that is in it.
 *
 * Membership, not visibility. The filters and the pinned/unpinned split keep cards off a grid
 * without taking them out of the listing's order — see spliceVisibleOrder.
 */
export function tasksInScope(tasks: Task[], scope: TaskGridScope, member: Task): Task[] {
  if (scope === 'folder') {
    return tasks.filter((task) => task.folderId === member.folderId)
  }
  if (scope === 'important') {
    return tasks.filter((task) => task.isImportant)
  }
  return tasks
}

/**
 * The whole listing's order, with the cards that were on screen rearranged into `visible`.
 *
 * A grid is never the whole listing. Pinned notes are drawn in a grid of their own, the tag, kind
 * and status filters hide whatever they hide, and all of it shares one order. Writing 0…n−1 over
 * the cards one grid happened to be showing is what put four notes on index 0 and let clearing a
 * filter interleave them.
 *
 * So the slots stay where they are and only their occupants move: walk the full order, and wherever
 * it holds one of the cards that were on screen, put the next one from the new visible order there
 * instead. A hidden card between two visible ones stays between them, which is the only reading of
 * "drop it here" that survives the filter being cleared.
 */
export function spliceVisibleOrder(full: readonly string[], visible: readonly string[]): string[] {
  const known = new Set(full)
  // Filtered to what the listing actually holds, so the slots and the queue cannot fall out of
  // step and shift every card after the mismatch by one.
  const queue = visible.filter((id) => known.has(id))
  const moving = new Set(queue)
  let next = 0
  return full.map((id) => (moving.has(id) ? queue[next++] : id))
}

/**
 * Where a dropped card belongs in this grid's order.
 *
 * This is the piece that was missing, and its absence was the largest defect in the feature. The
 * order used to be read straight off the layout react-grid-layout settled into, sorted by y and
 * then x — but the arrangement is *drawn* by buildGridLayout, which is first-fit and pulls a later
 * narrow card up into an earlier row's gap. Two different packers on either side of one round trip,
 * so the order stored was not a description of the arrangement: a fifth of all orders rendered as
 * something else, and better than a quarter of drops landed somewhere other than what was saved.
 * Sorting by exact y made it worse as soon as two cards had different heights, because a settled
 * layout is a masonry rather than rows.
 *
 * So the drop is resolved *through* the packer instead of around it. Every position the card could
 * be inserted at is packed, and the one that puts it nearest the cell it was released over wins.
 * The packer is then the only thing that decides where a card sits, and an order becomes something
 * it can reproduce.
 *
 * Cost is one pack per candidate position, so quadratic in the cards on screen. It runs once, on
 * pointer-up, over a list somebody is looking at.
 */
export function orderAfterDrop(
  tasks: Task[],
  cardsPerRow: number,
  scope: TaskGridScope,
  draggedId: string,
  drop: { x: number; y: number },
): string[] {
  const ordered = inDisplayOrder(tasks, scope)
  const home = ordered.findIndex((task) => task.id === draggedId)
  if (home < 0) {
    return ordered.map((task) => task.id)
  }
  const dragged = ordered[home]
  const rest = ordered.filter((task) => task.id !== draggedId)

  let bestIndex = home
  let bestScore = Number.POSITIVE_INFINITY
  for (let index = 0; index <= rest.length; index += 1) {
    const candidate = [...rest.slice(0, index), dragged, ...rest.slice(index)]
    // packInOrder, not buildGridLayout: the latter sorts by the *stored* order first, which would
    // undo the very permutation being tested and score every candidate identically.
    const placed = packInOrder(candidate, cardsPerRow, scope).find((item) => item.i === draggedId)
    if (!placed) {
      continue
    }
    // Both distances in units of roughly one card, so a row away weighs about as much as a column
    // away and neither drowns the other: y is in grid rows, x in grid columns.
    const score = Math.abs(placed.y - drop.y) / DEFAULT_H + Math.abs(placed.x - drop.x) / GRID_COLS
    if (score < bestScore - SCORE_EPSILON) {
      bestScore = score
      bestIndex = index
      continue
    }
    // A tie goes to the position closest to where the card already was, so a drop the packer cannot
    // honour leaves the card where it is rather than flinging it to the first of a row of equally
    // wrong candidates.
    if (
      Math.abs(score - bestScore) <= SCORE_EPSILON &&
      Math.abs(index - home) < Math.abs(bestIndex - home)
    ) {
      bestIndex = index
    }
  }

  return [...rest.slice(0, bestIndex), dragged, ...rest.slice(bestIndex)].map((task) => task.id)
}

/** Two candidate placements this close are the same placement; the scores are ratios of integers
 *  and comparing them exactly would let floating-point noise decide a drop. */
const SCORE_EPSILON = 1e-9

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

/**
 * Every width a card may have: whole multiples of the minimum, never a partial unit.
 *
 * Applied to the *live* resize as well as the stored one — see snapCardWidth in TaskGridCanvas.
 * Snapping only on the way to storage is what made a small resize look like it had worked and then
 * vanish on reload: the width the pointer produced rounded back to the width the card already had,
 * so there was nothing to save, and nothing to correct the screen with either.
 */
export function snapWidth(width: number, minWidth: number): number {
  const units = Math.max(1, Math.round(width / minWidth))
  return Math.min(GRID_COLS, units * minWidth)
}

/** How much a card may grow before it is treated as claiming the next unit: a quarter of one grid
 *  column, which is a couple of pixels. It exists so a card sitting exactly on a unit boundary
 *  doesn't claim the next one the instant the handle is touched. */
const SNAP_UP_TOLERANCE = 0.25

/**
 * The width a card *claims* mid-resize: the smallest whole number of card-widths that contains it.
 *
 * Snapping to the nearest unit is right for storing a width and wrong for showing one, because the
 * grid paints the card being resized at the raw pointer width while its layout slot stays at the
 * snapped one (calcGridItemPosition takes the resize position over the grid geometry). So with
 * nearest-snapping, a card dragged half a unit wider is drawn straddling its neighbour while the
 * layout still says it fits — the neighbour sits there overlapped until the pointer passes the
 * halfway mark, and only then does everything jump.
 *
 * Rounding up means the card claims the next unit as soon as it grows past the one it has: the
 * neighbour moves out of the way on the first pixel of overlap, and the card fills the space it was
 * given as you keep pulling. Nothing is ever drawn over anything.
 *
 * Shrinking is the same rule read backwards — the slot is given up once the card fits inside the
 * smaller one — so the gesture behaves the same in both directions and cannot oscillate: the result
 * is already a multiple of the minimum, so applying it again changes nothing.
 */
export function snapWidthUp(width: number, minWidth: number): number {
  const units = Math.max(1, Math.ceil((width - SNAP_UP_TOLERANCE) / minWidth))
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
 *
 * This function is the *only* authority on where a card sits. Nothing reads a position back out of
 * the grid and stores it — see orderAfterDrop for what happens when two packers disagree.
 */
export function buildGridLayout(
  tasks: Task[],
  cardsPerRow: number,
  scope: TaskGridScope,
): GridItemLayout[] {
  return packInOrder(inDisplayOrder(tasks, scope), cardsPerRow, scope)
}

/**
 * The packing on its own, over a sequence somebody has already decided.
 *
 * Split out from buildGridLayout because deciding the order and drawing it are two jobs, and
 * orderAfterDrop needs the second without the first: it asks "where would this card sit if it went
 * here?", and buildGridLayout would answer by sorting the sequence back into stored order and
 * drawing that instead — the same arrangement for every candidate, which is exactly what the
 * checks caught.
 */
export function packInOrder(
  ordered: readonly Task[],
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
  return (
    a.w === b.w && a.h === b.h && a.order === b.order && a.orderFolderId === b.orderFolderId
  )
}
