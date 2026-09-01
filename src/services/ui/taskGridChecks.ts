import { verticalCompactor } from 'react-grid-layout'
import {
  DEFAULT_H,
  GRID_COLS,
  buildGridLayout,
  inDisplayOrder,
  minWidthFor,
  orderAfterDrop,
  samePlacement,
  snapWidth,
  snapWidthUp,
  spliceVisibleOrder,
  storedOrder,
  tasksInScope,
} from '../../lib/taskGrid'
import { inBaseOrder } from '../../lib/tasks'
import type { Task, TaskGridPlacement, TaskGridScope } from '../../types'

/**
 * The rules the card canvas has to keep, as assertions.
 *
 * Every one of these was a bug first. The arrangement code had no checks at all, and it is exactly
 * the kind of code that needs them: five pure functions, a round trip between two of them, and a
 * failure mode that is invisible until a page is reloaded. What went wrong is written beside each
 * check rather than in a commit message.
 */

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const SCOPE: TaskGridScope = 'tasks'

function task(
  id: string,
  overrides: { folderId?: string; sortOrder?: number; important?: boolean } = {},
  placements: Partial<Record<TaskGridScope, TaskGridPlacement>> | null = null,
): Task {
  return {
    id,
    title: id,
    folderId: overrides.folderId ?? 'folder-1',
    content: '',
    isImportant: overrides.important ?? false,
    pinnedScopes: [],
    sortOrder: overrides.sortOrder ?? 0,
    gridLayouts: placements,
    noteKind: 'note',
    dueAt: null,
    completed: false,
    completedAt: null,
    tags: [],
    color: null,
  }
}

/** A card in this listing at `order`, sized `w` columns wide. */
function placed(id: string, order: number, w: number, folderId = 'folder-1'): Task {
  return task(id, { folderId }, { [SCOPE]: { v: 2, order, w } })
}

function ids(tasks: Task[]): string {
  return tasks.map((item) => item.id).join(',')
}

/** The order the grid actually draws, which is the only order a reader ever sees. */
function drawnOrder(tasks: Task[], cardsPerRow: number, scope: TaskGridScope = SCOPE): string {
  return buildGridLayout(tasks, cardsPerRow, scope)
    .slice()
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
    .map((item) => item.i)
    .join(',')
}

/**
 * I3 — every listing has a deterministic order, whatever array it was handed.
 *
 * Cards with no stored order used to keep the position the array arrived in, and the flat listings
 * hand over whatever the load returned: `ORDER BY sort_order` over rows whose sort_order restarts at
 * 0 in every folder, so almost all of them are tied. Postgres orders tied rows however it likes, and
 * rewriting a row can change that — which meant saving a card's *size* reshuffled the page.
 */
function checkDeterministicOrder(): void {
  const a = task('a', { folderId: 'f1', sortOrder: 0 })
  const b = task('b', { folderId: 'f2', sortOrder: 0 })
  const c = task('c', { folderId: 'f3', sortOrder: 0 })

  assert(
    ids(inDisplayOrder([c, a, b], SCOPE)) === 'a,b,c',
    'cards tied on sortOrder fall back to the id, not to the order the array arrived in',
  )
  assert(
    ids(inDisplayOrder([a, b, c], SCOPE)) === ids(inDisplayOrder([b, c, a], SCOPE)),
    'and the same set in a different array order produces the same listing',
  )
  assert(ids(inBaseOrder([c, b, a])) === 'a,b,c', 'inBaseOrder is the same rule for the flat pages')

  const arranged = placed('z', 0, 40)
  assert(
    ids(inDisplayOrder([a, arranged], SCOPE)) === 'z,a',
    'an arranged card comes before one nobody has arranged',
  )
  assert(
    ids(inDisplayOrder([placed('q', 5, 40), placed('p', 2, 40)], SCOPE)) === 'p,q',
    'and arranged cards go by their index',
  )
}

/**
 * I1 — an order is something the packer can reproduce.
 *
 * The order used to be read off the layout react-grid-layout settled into, sorted by y then x, while
 * the arrangement was drawn by a first-fit packer that pulls a later narrow card up into an earlier
 * row's gap. Two different algorithms on either side of one round trip: a fifth of stored orders
 * rendered as something else. This is the case that proved it — stored P,Q,R,S drawn as P,Q,S,R.
 */
function checkOrderRoundTrip(): void {
  const widths: Record<string, number> = { p: 40, q: 40, r: 80, s: 40, t: 40 }
  const order = ['p', 'q', 'r', 's', 't']
  const tasks = order.map((id, index) => placed(id, index, widths[id]))

  const drawn = drawnOrder(tasks, 3).split(',')
  // Not "the stored order is what is drawn" — first-fit is allowed to move a card up into a gap, and
  // should. What must hold is that re-reading the drawn arrangement gives back the same order, so a
  // drag cannot rewrite an arrangement it was meant to preserve.
  const reread = drawn.map((id, index) => placed(id, index, widths[id]))
  assert(
    drawnOrder(reread, 3) === drawn.join(','),
    'the arrangement the packer draws is a fixed point: drawing it again changes nothing',
  )

  for (let index = 0; index < tasks.length; index += 1) {
    const dragged = tasks[index]
    const cell = buildGridLayout(tasks, 3, SCOPE).find((item) => item.i === dragged.id)
    assert(cell !== undefined, 'every card is placed')
    const resolved = orderAfterDrop(tasks, 3, SCOPE, dragged.id, { x: cell!.x, y: cell!.y })
    assert(
      resolved.join(',') === ids(inDisplayOrder(tasks, SCOPE)),
      `dropping ${dragged.id} back on its own cell resolves to no move`,
    )
  }
}

/**
 * I1 — a card dropped on another card's cell takes that cell.
 *
 * This is the property a reader is actually testing when they drag something, and better than a
 * quarter of drops used to fail it: the position was read out of the grid's own compaction rather
 * than resolved through the packer, so the card reappeared somewhere else on the next render and
 * again after a reload.
 *
 * Uniform widths, so every cell is reachable and the assertion can be exact rather than
 * "near enough" — a card is either on the cell it was dropped on or it isn't. Mixed widths are
 * checked below, where the honest claim is weaker because a row can be too full to take a card.
 */
function checkDropsLandWhereDropped(): void {
  const order = ['p', 'q', 'r', 's', 't']
  const tasks = order.map((id, index) => placed(id, index, 40))
  const before = buildGridLayout(tasks, 3, SCOPE)

  for (const dragged of tasks) {
    for (const target of tasks) {
      if (target.id === dragged.id) {
        continue
      }
      const cell = before.find((item) => item.i === target.id)!
      const resolved = orderAfterDrop(tasks, 3, SCOPE, dragged.id, { x: cell.x, y: cell.y })
      assert(
        [...resolved].sort().join(',') === [...order].sort().join(','),
        'a drop rearranges the listing and never loses or duplicates a card',
      )
      const landed = buildGridLayout(
        resolved.map((id, index) => placed(id, index, 40)),
        3,
        SCOPE,
      ).find((item) => item.i === dragged.id)!
      assert(
        landed.x === cell.x && landed.y === cell.y,
        `dropping ${dragged.id} on ${target.id}'s cell puts it there, not near it`,
      )
    }
  }
}

/**
 * I1 — with mixed widths, a drop lands as close as the packer can put it, and stays put.
 *
 * The packer never leaves a hole to honour a drop, so a cell in a full row is simply not available
 * and the card goes to the nearest one that is. What must not happen is the card moving *again*
 * afterwards: the arrangement a drop resolves to has to be one the packer reproduces, or the reader
 * watches their card walk away from where they put it.
 */
function checkDropsSettle(): void {
  const widths: Record<string, number> = { p: 40, q: 40, r: 80, s: 40, t: 40 }
  const order = ['p', 'q', 'r', 's', 't']
  const tasks = order.map((id, index) => placed(id, index, widths[id]))
  const minW = minWidthFor(3)

  for (const dragged of tasks) {
    for (let x = 0; x <= GRID_COLS - minW; x += minW) {
      for (let y = 0; y <= DEFAULT_H * 3; y += DEFAULT_H) {
        const resolved = orderAfterDrop(tasks, 3, SCOPE, dragged.id, { x, y })
        const after = resolved.map((id, index) => placed(id, index, widths[id]))
        const drawn = drawnOrder(after, 3)
        const settled = drawn.split(',').map((id, index) => placed(id, index, widths[id]))
        assert(
          drawnOrder(settled, 3) === drawn,
          `the arrangement after dropping ${dragged.id} at (${x},${y}) is one the packer reproduces`,
        )
      }
    }
  }
}

/**
 * I1 — a settled layout is a masonry, and reading rows off it by exact y was wrong.
 *
 * The old write path sorted by (y, x). buildGridLayout gives every card in a row the same y, so that
 * held for its output — but react-grid-layout lifts each card independently, and resizing heights is
 * exactly what makes the columns fall out of step. This is the layout that used to be read back as
 * a,b,d,c.
 */
function checkMixedHeightsAreNotRows(): void {
  const settled = verticalCompactor.compact(
    [
      { i: 'a', x: 0, y: 0, w: 60, h: 12 },
      { i: 'b', x: 60, y: 0, w: 60, h: 5 },
      { i: 'c', x: 0, y: 12, w: 60, h: 6 },
      { i: 'd', x: 60, y: 5, w: 60, h: 6 },
    ],
    GRID_COLS,
  )
  const byExactY = settled
    .slice()
    .sort((left, right) => (left.y === right.y ? left.x - right.x : left.y - right.y))
    .map((item) => item.i)
    .join(',')
  assert(
    byExactY === 'a,b,d,c',
    'the grid really does settle into a masonry — this is why nothing reads an order out of it',
  )

  const tasks = ['a', 'b', 'c', 'd'].map((id, index) =>
    task(id, {}, { [SCOPE]: { v: 2, order: index, w: 60, h: id === 'a' ? 12 : 6 } }),
  )
  assert(
    drawnOrder(tasks, 2) === 'a,b,c,d',
    'and the packer draws proper rows, so the order it is given is the order it shows',
  )
}

/**
 * I2 — an order is a total order over the listing, not over one grid.
 *
 * Every listing draws two grids: pinned cards, then the rest. Each used to renumber from 0, so two
 * cards held index 0 and two held index 1, and the collision only became visible when a card crossed
 * between them. Dragging under a filter did the same thing to whatever was hidden.
 */
function checkOrderCoversTheWholeListing(): void {
  const full = ['a', 'b', 'c', 'd', 'e']

  assert(
    spliceVisibleOrder(full, ['e', 'd']).join(',') === 'a,b,c,e,d',
    'the cards on screen swap places and the hidden ones keep theirs',
  )
  assert(
    spliceVisibleOrder(full, ['e', 'a']).join(',') === 'e,b,c,d,a',
    'the slots stay put; only their occupants move, so a hidden card stays between its neighbours',
  )
  assert(
    spliceVisibleOrder(full, full).join(',') === full.join(','),
    'and an unchanged visible order changes nothing',
  )
  assert(
    spliceVisibleOrder(full, ['e', 'gone', 'd']).join(',') === 'a,b,c,e,d',
    'an id the listing does not hold is dropped rather than shifting every card after it',
  )

  const indices = spliceVisibleOrder(full, ['e', 'd']).map((_, index) => index)
  assert(new Set(indices).size === indices.length, 'the indices written are unique')
}

/**
 * I2 — the listing a card belongs to, which is not the same as the cards on screen.
 *
 * Membership decides whose indices get renumbered. Getting it wrong is how a drag in one folder
 * could renumber another folder's cards.
 */
function checkScopeMembership(): void {
  const here = task('here', { folderId: 'f1' })
  const elsewhere = task('elsewhere', { folderId: 'f2' })
  const starred = task('starred', { folderId: 'f2', important: true })
  const all = [here, elsewhere, starred]

  assert(ids(tasksInScope(all, 'folder', here)) === 'here', 'a folder listing is one folder')
  assert(
    ids(tasksInScope(all, 'important', starred)) === 'starred',
    'Starred is the starred notes, wherever they live',
  )
  assert(ids(tasksInScope(all, 'tasks', here)) === 'here,elsewhere,starred', 'Tasks is everything')
}

/**
 * I2 — a folder-scope order belongs to the folder it was minted in.
 *
 * All folder views share one scope, which is right for size and wrong for order: moving a note used
 * to carry its position number into a folder full of notes that already had those numbers.
 */
function checkFolderOrderIsPerFolder(): void {
  const moved = task('moved', { folderId: 'f2' }, { folder: { v: 2, order: 3, orderFolderId: 'f1' } })
  assert(storedOrder(moved, 'folder') === null, 'an order minted in another folder does not apply')

  const home = task('home', { folderId: 'f1' }, { folder: { v: 2, order: 3, orderFolderId: 'f1' } })
  assert(storedOrder(home, 'folder') === 3, 'and it applies in the folder it was minted in')

  const legacy = task('legacy', { folderId: 'f9' }, { folder: { v: 2, order: 3 } })
  assert(
    storedOrder(legacy, 'folder') === 3,
    'an order written before folders were recorded belongs to wherever the note is now, so nothing resets',
  )

  const flat = task('flat', { folderId: 'f2' }, { tasks: { v: 2, order: 3, orderFolderId: 'f1' } })
  assert(storedOrder(flat, 'tasks') === 3, 'the flat listings have no folder to belong to')
}

/**
 * I4 — what is stored is what is shown.
 *
 * A resize was quantised on its way to storage only. A drag shorter than half a card rounded back to
 * the width the card already had, so there was nothing to write — and because nothing was written
 * the layout prop never changed, and the grid went on showing a width nothing had recorded until the
 * page was reloaded. The quantisation now happens while the pointer is moving (snapCardWidth), so
 * these are the only widths a card is ever *shown* at.
 */
function checkWidthsAreStorable(): void {
  const minW = minWidthFor(6)
  assert(minW === 20, 'six cards per row is a minimum of a fifth of the canvas')

  for (let width = 1; width <= GRID_COLS; width += 1) {
    const snapped = snapWidth(width, minW)
    assert(snapped % minW === 0, `a width of ${width} snaps to a whole number of cards`)
    assert(snapped >= minW && snapped <= GRID_COLS, `and stays on the canvas at ${width}`)
    assert(
      snapWidth(snapped, minW) === snapped,
      `snapping is idempotent, so what is shown is what is stored (${width})`,
    )
  }
}

/**
 * I4 — a card claims the next slot the moment it outgrows the one it has.
 *
 * The grid paints the card being resized at the raw pointer width, so a slot that only widens at the
 * halfway mark leaves the card drawn across its neighbour for half of every gesture — the neighbour
 * sitting there overlapped, then everything jumping at once. Rounding up is what makes the neighbour
 * step aside on the first pixel of overlap.
 */
function checkResizeClaimsTheNextSlot(): void {
  const minW = minWidthFor(6)

  assert(snapWidthUp(minW, minW) === minW, 'a card resting on a slot boundary keeps its slot')
  assert(
    snapWidthUp(minW + 1, minW) === minW * 2,
    'and one column past it claims the next one — not at the halfway mark',
  )
  assert(
    snapWidth(minW + 1, minW) === minW,
    'which is exactly where nearest-snapping used to leave the neighbour overlapped',
  )
  assert(
    snapWidthUp(minW * 2 - 1, minW) === minW * 2,
    'the claim holds all the way to the far edge of the slot',
  )
  assert(
    snapWidthUp(GRID_COLS + 40, minW) === GRID_COLS,
    'and never runs off the canvas',
  )

  for (let width = 1; width <= GRID_COLS; width += 1) {
    const claimed = snapWidthUp(width, minW)
    assert(claimed % minW === 0, `a claimed width is a whole number of cards (${width})`)
    assert(claimed >= width - 1, `and is never narrower than the card it has to contain (${width})`)
    assert(
      snapWidthUp(claimed, minW) === claimed,
      `re-applying the claim changes nothing, so a gesture cannot oscillate (${width})`,
    )
  }
}

/** I4 — a write is skipped only when the stored placement already says the same thing, including
 *  which folder an order belongs to. Missing that field would have let a move go unrecorded. */
function checkSamePlacement(): void {
  assert(samePlacement(null, { v: 2, w: 20 }) === false, 'a card with no placement always writes')
  assert(samePlacement({ v: 2, w: 20, h: 7 }, { v: 2, w: 20, h: 7 }), 'an identical placement does not')
  assert(
    samePlacement({ v: 1, w: 20, h: 7 }, { v: 2, w: 20, h: 7 }),
    'and the version stamp alone is not a change, or every card would be rewritten after a bump',
  )
  assert(
    samePlacement({ v: 2, order: 1, orderFolderId: 'f1' }, { v: 2, order: 1, orderFolderId: 'f2' }) ===
      false,
    'the same index in a different folder is a different placement',
  )
}

export function runTaskGridChecks(): void {
  checkDeterministicOrder()
  checkOrderRoundTrip()
  checkDropsLandWhereDropped()
  checkDropsSettle()
  checkMixedHeightsAreNotRows()
  checkOrderCoversTheWholeListing()
  checkScopeMembership()
  checkFolderOrderIsPerFolder()
  checkWidthsAreStorable()
  checkResizeClaimsTheNextSlot()
  checkSamePlacement()
}
