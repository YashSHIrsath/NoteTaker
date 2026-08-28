/**
 * The arithmetic behind drag-to-reorder.
 *
 * Pulled out of the components because this is the part that goes subtly wrong: a target index that
 * disagrees with the row displacements by one, or a settle offset that differs from where the
 * committed order will put the row, so it snaps a few pixels at the end of every drag.
 *
 * The whole approach rests on one rule: **nothing in the DOM moves while a drag is in progress.**
 * Rows are displaced with `transform` and the maths is done against measurements frozen at the start.
 * The first version of this in the app rearranged the list live and then worked out the target by
 * measuring the pointer against rows it had just moved — so a swap changed what was under your finger
 * and could immediately swap it back. It oscillated, which is why it worked one time in three, and it
 * could not animate, because rows were being re-inserted rather than moved.
 */

export interface SortableRowMetrics {
  id: string
  /** Distance from the list's own top to this row's top, at drag start. */
  top: number
  height: number
}

/**
 * Measure a group's rows, in the order they are laid out.
 *
 * Sorted by position rather than trusted in registration order: rows register as they mount, and a
 * list that re-renders can register them in any order at all. Position is the only thing that
 * matches what the person dragging can see.
 */
export function measureRows(entries: Array<{ id: string; element: HTMLElement }>): SortableRowMetrics[] {
  return entries
    .map(({ id, element }) => ({
      id,
      top: element.offsetTop,
      height: element.offsetHeight,
    }))
    .sort((a, b) => a.top - b.top)
}

/**
 * The gap between rows, measured from the first adjacent pair.
 *
 * Rows can differ in height — a tree node, a folder card, a sidebar row — but the *gap* between
 * them is set once by the container, so one measurement is exact for the whole list. Without it a
 * displacement would be short by the gap on every step, and the rows would visibly overlap by a few
 * pixels mid-drag.
 */
export function measureGap(rows: SortableRowMetrics[]): number {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!
    const gap = rows[index]!.top - (previous.top + previous.height)
    // A negative reading means overlapping or transformed rows, which is not a gap.
    if (gap >= 0) {
      return gap
    }
  }
  return 0
}

/**
 * Which slot the dragged row is currently over.
 *
 * Compared against the *original* centres, not the displaced ones. That is what makes it monotonic:
 * the answer depends only on how far the pointer has travelled, so it cannot feed back on the
 * displacement it causes. Using live positions is exactly the oscillation described above.
 *
 * The loops break rather than continue, so a row is only passed once every row before it has been.
 */
export function targetIndexFor(
  rows: SortableRowMetrics[],
  startIndex: number,
  delta: number,
): number {
  const dragged = rows[startIndex]
  if (!dragged) {
    return startIndex
  }
  const centre = dragged.top + delta + dragged.height / 2
  let target = startIndex

  if (delta > 0) {
    for (let index = startIndex + 1; index < rows.length; index += 1) {
      const row = rows[index]!
      if (centre >= row.top + row.height / 2) {
        target = index
      } else {
        break
      }
    }
  } else if (delta < 0) {
    for (let index = startIndex - 1; index >= 0; index -= 1) {
      const row = rows[index]!
      if (centre <= row.top + row.height / 2) {
        target = index
      } else {
        break
      }
    }
  }

  return target
}

/**
 * How far a row is displaced, given where the drag started and where it is heading.
 *
 * Every row between the two indices steps into its neighbour's place; everything outside that span
 * stays exactly where it is. The dragged row itself follows the pointer.
 *
 * Measured from the neighbour's own top rather than as "the dragged row's height plus the gap".
 * The two agree exactly whenever the rows are evenly spaced, and the neighbour version is right when
 * they are not — which matters here because one of these lists is a tree, where each row's expanded
 * children sit *between* it and the next sibling. A slot computed from a height and a gap would
 * displace those rows by a fraction of the distance they actually have to travel.
 */
export function offsetForRow(
  rows: SortableRowMetrics[],
  startIndex: number,
  targetIndex: number,
  rowIndex: number,
  delta: number,
): number {
  if (rowIndex === startIndex) {
    return delta
  }
  const row = rows[rowIndex]
  if (!row) {
    return 0
  }

  if (targetIndex > startIndex && rowIndex > startIndex && rowIndex <= targetIndex) {
    const above = rows[rowIndex - 1]
    return above ? above.top - row.top : 0
  }
  if (targetIndex < startIndex && rowIndex < startIndex && rowIndex >= targetIndex) {
    const below = rows[rowIndex + 1]
    return below ? below.top - row.top : 0
  }
  return 0
}

/**
 * Where the released row has to glide to, so that committing the new order changes nothing visible.
 *
 * This is the number that betrays a reorder animation when it is wrong: the row settles, the real
 * order is applied underneath it, and if the two disagree by even a few pixels the row jumps at the
 * very end — which reads as the drag having failed and corrected itself.
 *
 * Moving down, the row ends up with its *bottom* aligned to the bottom of the row it passed last;
 * moving up, with its *top* aligned to the top of the row it displaced. Both hold when the rows are
 * different heights, which is why neither is expressed as a multiple of a slot.
 */
export function settleOffset(
  rows: SortableRowMetrics[],
  startIndex: number,
  targetIndex: number,
): number {
  const dragged = rows[startIndex]
  const target = rows[targetIndex]
  if (!dragged || !target || startIndex === targetIndex) {
    return 0
  }
  const newTop =
    targetIndex > startIndex ? target.top + target.height - dragged.height : target.top
  return newTop - dragged.top
}

/** Moving an item within an array, which is what every one of these drags ultimately is. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/**
 * The reorder call the app's folder API takes: a dragged id, a target id, and a side.
 *
 * Derived from two indices rather than from the pointer, so the keyboard path and the drag path
 * produce identical calls. Which side of the target depends on the direction of travel: dropping
 * onto a row from above means landing after it, from below means before it.
 */
export function reorderArgs(
  rows: SortableRowMetrics[],
  startIndex: number,
  targetIndex: number,
): { draggedId: string; targetId: string; position: 'before' | 'after' } | null {
  const dragged = rows[startIndex]
  const target = rows[targetIndex]
  if (!dragged || !target || startIndex === targetIndex) {
    return null
  }
  return {
    draggedId: dragged.id,
    targetId: target.id,
    position: targetIndex > startIndex ? 'after' : 'before',
  }
}
