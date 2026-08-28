import {
  measureGap,
  moveItem,
  offsetForRow,
  reorderArgs,
  settleOffset,
  targetIndexFor,
  type SortableRowMetrics,
} from '../../lib/sortable'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

/** Four rows of equal height, 8px apart — a sidebar list. */
function evenRows(): SortableRowMetrics[] {
  return [
    { id: 'a', top: 0, height: 40 },
    { id: 'b', top: 48, height: 40 },
    { id: 'c', top: 96, height: 40 },
    { id: 'd', top: 144, height: 40 },
  ]
}

/**
 * Four rows of *different* heights, still 8px apart — the tree, where a node with its children
 * expanded is several times the height of a leaf.
 *
 * This is the case the app's other reorder list never had to handle: the nav settings list measures
 * one slot height and multiplies. Doing that here would put the gap in the wrong place on every
 * drag between two rows of unlike size.
 */
function unevenRows(): SortableRowMetrics[] {
  return [
    { id: 'a', top: 0, height: 40 },
    { id: 'b', top: 48, height: 120 },
    { id: 'c', top: 176, height: 40 },
    { id: 'd', top: 224, height: 80 },
  ]
}

function checkGap(): void {
  assert(measureGap(evenRows()) === 8, 'the gap is read from the first adjacent pair')
  assert(measureGap(unevenRows()) === 8, 'and is the same whatever the rows do')
  assert(measureGap([{ id: 'a', top: 0, height: 40 }]) === 0, 'one row has no gap to measure')
  assert(measureGap([]) === 0, 'and neither has none')
}

/**
 * The target index, which must depend only on how far the pointer has moved.
 *
 * The rule is a row is passed when the dragged row's centre reaches that row's centre. Compared
 * against the *original* centres, so the answer cannot feed back on the displacement it causes —
 * which is the oscillation the previous implementation had.
 */
function checkTarget(): void {
  const rows = evenRows()

  assert(targetIndexFor(rows, 0, 0) === 0, 'no movement is no move')
  assert(targetIndexFor(rows, 0, 5) === 0, 'and a nudge short of the next centre is still no move')

  // Row a's centre is 20. Row b's centre is 68. So a must travel 48 to reach it.
  assert(targetIndexFor(rows, 0, 47) === 0, 'a pixel short of b’s centre has not passed it')
  assert(targetIndexFor(rows, 0, 48) === 1, 'reaching b’s centre passes it')
  assert(targetIndexFor(rows, 0, 96) === 2, 'and twice that passes c')

  // Upward, from the last row.
  assert(targetIndexFor(rows, 3, -48) === 2, 'dragging up passes the row above')
  assert(targetIndexFor(rows, 3, -144) === 0, 'and all the way up reaches the first')

  // Past either end is clamped by the loops, not by a separate guard.
  assert(targetIndexFor(rows, 0, 10_000) === 3, 'dragging far below the list stops at the last row')
  assert(targetIndexFor(rows, 3, -10_000) === 0, 'and far above it stops at the first')

  // Uneven rows: b is 120 tall, so a has much further to travel to pass it. This is the assertion
  // that fails if a fixed slot height is assumed anywhere.
  const uneven = unevenRows()
  assert(targetIndexFor(uneven, 0, 60) === 0, 'a tall row is not passed at a short row’s distance')
  assert(targetIndexFor(uneven, 0, 88) === 1, 'it is passed at its own centre')
}

/** Displacement: the rows between the two indices step aside by exactly one dragged-row slot. */
function checkOffsets(): void {
  const rows = evenRows()
  const slot = 48 // 40 tall + 8 gap

  // a dragged down to c's slot: b and c move up, d does not move at all.
  assert(offsetForRow(rows, 0, 2, 0, 96) === 96, 'the dragged row follows the pointer exactly')
  assert(offsetForRow(rows, 0, 2, 1, 96) === -slot, 'a row it passed steps up one slot')
  assert(offsetForRow(rows, 0, 2, 2, 96) === -slot, 'and so does the last one it passed')
  assert(offsetForRow(rows, 0, 2, 3, 96) === 0, 'a row beyond the target does not move')

  // d dragged up to b's slot: b and c move down.
  assert(offsetForRow(rows, 3, 1, 2, -96) === slot, 'dragging up pushes rows down')
  assert(offsetForRow(rows, 3, 1, 1, -96) === slot, 'every row in the span')
  assert(offsetForRow(rows, 3, 1, 0, -96) === 0, 'and nothing outside it')

  // No move at all leaves everything alone.
  assert(offsetForRow(rows, 1, 1, 0, 3) === 0, 'a drag that has not passed anything displaces nobody')
  assert(offsetForRow(rows, 1, 1, 1, 3) === 3, 'except the row being dragged')

  // Uneven: the slot is the *dragged* row's height plus the gap, not the displaced row's.
  const uneven = unevenRows()
  assert(
    offsetForRow(uneven, 1, 2, 2, 128) === -(120 + 8),
    'a short row steps aside by the tall row’s height, because that is the space being vacated',
  )
  assert(
    offsetForRow(uneven, 0, 1, 1, 88) === -(40 + 8),
    'and a tall row steps aside by the short one’s',
  )
}

/**
 * The settle offset, which is the number that betrays the whole animation when it is wrong.
 *
 * The released row glides to this offset, then the real order is committed underneath it. If the two
 * disagree by even a few pixels the row jumps at the very end of every drag, which reads as the
 * reorder having failed and corrected itself.
 *
 * So each case is checked against where the row provably ends up once the array is reordered.
 */
function checkSettle(): void {
  const rows = evenRows()

  assert(settleOffset(rows, 0, 0) === 0, 'no move, no glide')
  // a → c's place. In the new order the third row's top is 96, and a started at 0.
  assert(settleOffset(rows, 0, 2) === 96, 'moving down lands on the passed row’s slot')
  // d → b's place. b's top is 48, d started at 144.
  assert(settleOffset(rows, 3, 1) === 48 - 144, 'moving up lands on the displaced row’s top')

  /*
   * And the uneven case, worked out by hand because it is the one a formula gets wrong.
   *
   * Rows: a(0,40) b(48,120) c(176,40) d(224,80), gap 8.
   * Drag a down past b. The new order is b, a, c, d — so b's top becomes 0 and a's becomes 128
   * (b's height plus the gap). a started at 0, so it must glide 128.
   */
  const uneven = unevenRows()
  assert(
    settleOffset(uneven, 0, 1) === 128,
    'a short row moving past a tall one glides the tall row’s full height plus the gap',
  )
  /*
   * Drag b (tall) up past a. New order is b, a — b's top becomes 0. b started at 48, so −48.
   */
  assert(settleOffset(uneven, 1, 0) === -48, 'and a tall row moving up glides to the short row’s top')
}

/** The call the folder API receives. Direction decides the side, so the keyboard and the pointer
 *  produce the same thing. */
function checkReorderArgs(): void {
  const rows = evenRows()

  assert(reorderArgs(rows, 0, 0) === null, 'a move to where it already is is not a reorder')
  const down = reorderArgs(rows, 0, 2)
  assert(down?.draggedId === 'a', 'the dragged row is named')
  assert(down?.targetId === 'c', 'and the row it landed on')
  assert(down?.position === 'after', 'coming from above means landing after it')

  const up = reorderArgs(rows, 3, 1)
  assert(up?.draggedId === 'd' && up?.targetId === 'b', 'the pair, going the other way')
  assert(up?.position === 'before', 'and coming from below means landing before it')
}

/** The array move the reorder ultimately is, including the calls that must change nothing. */
function checkMove(): void {
  const list = ['a', 'b', 'c', 'd']
  assert(moveItem(list, 0, 2).join('') === 'bcad', 'down the list')
  assert(moveItem(list, 3, 1).join('') === 'adbc', 'and up it')
  assert(moveItem(list, 1, 1) === list, 'a move to the same place returns the same array, untouched')
  assert(moveItem(list, -1, 2) === list, 'and an index off either end is refused rather than clamped')
  assert(moveItem(list, 0, 9) === list, 'either end')
  assert(list.join('') === 'abcd', 'and the original is never mutated')
}

export function runSortableChecks(): void {
  checkGap()
  checkTarget()
  checkOffsets()
  checkSettle()
  checkReorderArgs()
  checkMove()
}
