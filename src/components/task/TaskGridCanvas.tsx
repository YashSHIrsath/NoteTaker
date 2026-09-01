import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { GridLayout, useContainerWidth, verticalCompactor, type LayoutItem } from 'react-grid-layout'
import { gridBounds, minMaxSize, type LayoutConstraint } from 'react-grid-layout/core'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './TaskGridCanvas.css'
import type { Task, TaskGridScope } from '../../types'
import { useFolders } from '../../hooks/useFolders'
import { useCardsPerRow } from '../../hooks/useTileGrid'
import { useArrivalSide } from '../../hooks/usePageEnterDirection'
import {
  GRID_COLS,
  GRID_MARGIN,
  GRID_ROW_HEIGHT,
  buildGridLayout,
  minWidthFor,
  orderAfterDrop,
  snapWidth,
  snapWidthUp,
  type GridItemLayout,
} from '../../lib/taskGrid'
import { cn } from '../../lib/cn'

/** Kept only as the value react-grid-layout falls back to; nothing is painted at it. */
const INITIAL_WIDTH = 1280

/**
 * Quantises a resize while the pointer is still moving.
 *
 * Two things depend on this, and they are the two complaints the resize handle attracted.
 *
 * A card's width is a whole number of card-widths, and this is what makes the *shown* width one of
 * those too. Snapping only on the way to storage is what made "resize it slightly" fail: the width
 * the pointer produced rounded back to the width the card already had, so there was nothing to write
 * — and because nothing was written, the layout prop never changed, and react-grid-layout adopts a
 * prop only when its value does. The card sat there at a width nothing had recorded until reload.
 *
 * And it rounds *up* (snapWidthUp), so a card claims the next unit the moment it grows past the one
 * it has rather than at the halfway mark. The grid paints the card being resized at the raw pointer
 * width, so with nearest-snapping the card spent half of every gesture drawn across its neighbour
 * while the layout still said it fitted — nothing moved until the pointer crossed halfway, then
 * everything jumped at once. Rounding up means the neighbour steps aside on the first pixel of
 * overlap and the card grows into the room it was given.
 *
 * Reads `item.minW`, which buildGridLayout already sets per card, so there is no closure over the
 * current setting to keep in step.
 *
 * Runs last, after the library's own two: gridBounds caps the width at the columns left to the
 * right of the card and minMaxSize at the card's own min and max, and both of those bounds are
 * whole multiples of minW here, so snapping inside them cannot climb back out.
 */
const snapCardWidth: LayoutConstraint = {
  name: 'snapCardWidth',
  constrainSize: (item, w, h) => ({ w: snapWidthUp(w, item.minW ?? 1), h }),
}

const CONSTRAINTS: LayoutConstraint[] = [gridBounds, minMaxSize, snapCardWidth]

/** Whether the grid is showing exactly the arrangement the packer would draw. Compared field by
 *  field rather than by identity: react-grid-layout holds its own copy of the layout and rewrites
 *  it on every gesture. */
function sameArrangement(
  shown: readonly LayoutItem[],
  drawn: readonly GridItemLayout[],
): boolean {
  if (shown.length !== drawn.length) {
    return false
  }
  const byId = new Map(shown.map((item) => [item.i, item]))
  return drawn.every((card) => {
    const item = byId.get(card.i)
    return (
      item !== undefined &&
      item.x === card.x &&
      item.y === card.y &&
      item.w === card.w &&
      item.h === card.h
    )
  })
}

/** How much wider the cards start than they end, as a fraction of the canvas.
 *
 *  This is the squeeze, and it is deliberately small. It used to be whatever the gap happened to
 *  be between the library's 1280px guess and the real container — on a phone, nearly a metre of
 *  travel, which read as the cards being flung across the screen rather than settling. 12% of a
 *  360px column is ~43px: a card noticeably wider for a moment, and nothing more. */
const SQUEEZE = 0.12

export interface TaskGridCanvasProps {
  tasks: Task[]
  /**
   * Which listing this canvas is. Arrangements are stored per listing, so a card sized here
   * changes size here and nowhere else — see TaskGridScope.
   */
  scope: TaskGridScope
  /** Renders one card. The canvas owns the cell; this owns what's inside it. */
  children: (task: Task) => ReactNode
  /**
   * Colour for this card's resize arcs — pass the same ink the card itself uses, so the arcs read
   * as that card's own edge rather than as app furniture. The canvas can't work it out: which
   * colour a card falls back to when it has no explicit one is the view's decision, not the
   * grid's. Omit it and the arcs use a neutral, which is right for cards that aren't coloured.
   */
  handleColor?: (task: Task) => string | undefined
  className?: string
}

/**
 * The canvas the task cards sit on: drag a card anywhere, pull its bottom-right corner to size it.
 *
 * Two decisions shape how it behaves.
 *
 * Widen a card and whatever still fits beside it stays there at its own size; whatever doesn't
 * moves — to a gap further up if one will take it, otherwise to a new row against the left edge.
 * The arrangement is computed in lib/taskGrid, not by the library's compaction, which only ever
 * packs upward and left cards stranded on the right of an empty column.
 *
 * Only widths and heights are yours to set, and only for the card you touch. Positions follow, so
 * no sequence of resizes can leave a hole that something could have filled.
 *
 * It is one grid at every width, not a responsive one. Column positions are absolute rather than
 * rescaled per breakpoint, so an arrangement is the same arrangement on a phone. What the screen
 * changes is the *minimum* card width (see useCardsPerRow) — never where a card sits.
 *
 * Cards are dragged from a grip and resized from the bottom-right corner. Neither gesture stores a
 * position: a drag stores an order and a resize stores a size, and buildGridLayout decides the rest.
 * See dragConfig below for why the grip is a requirement rather than a preference.
 */
export function TaskGridCanvas({ tasks, scope, children, handleColor, className }: TaskGridCanvasProps) {
  const { updateTaskLayouts, rearrangeTasks } = useFolders()
  const { width, containerRef, mounted } = useContainerWidth({
    // Measure before painting anything: the guessed width must never reach the screen, or its
    // correction becomes an animation of its own on top of the one below.
    measureBeforeMount: true,
    initialWidth: INITIAL_WIDTH,
  })
  const cardsPerRow = useCardsPerRow()

  /**
   * The arrival squeeze: cards are laid out a little wider than they belong, then settle to their
   * real size under the grid's own transition — the same width animation as before, just over a
   * distance chosen here rather than inherited from a placeholder width.
   *
   * Two frames of the wider layout, so the browser paints it before the settle begins. One isn't
   * enough: the style change would land in the same frame and there'd be nothing to transition
   * from.
   */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!mounted || settled) {
      return
    }
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSettled(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [mounted, settled])

  const squeezing = mounted && !settled
  const renderWidth = squeezing ? Math.round(width * (1 + SQUEEZE)) : width

  /**
   * Which edge the squeeze collapses onto.
   *
   * Left to itself it converges on x=0, so the cards always appear to come in from the right.
   * Arriving from the left, the canvas starts shifted by the same amount the layout is
   * overwidth and settles back alongside the cards, which lines the wide layout up on its right
   * edge instead — the same squeeze, converging the other way.
   */
  const arriveFrom = useArrivalSide()
  /**
   * Played as a keyframe animation, and only once the settle has actually begun.
   *
   * Setting the offset as a plain style while a transition sat on the element made it animate
   * *into* the offset first and then back out of it: the canvas slid left, then right, while the
   * cards collapsed leftward — a squeeze arriving from both sides at once. An animation has one
   * direction and one trigger, and adding its class on the same commit the cards start moving
   * keeps the two together.
   */
  const mirrored = arriveFrom === 'left' && settled
  const mirrorX = Math.round(-width * SQUEEZE)

  const layout = useMemo(
    () => buildGridLayout(tasks, cardsPerRow, scope),
    [tasks, cardsPerRow, scope],
  )

  /**
   * The cards, in the order they are drawn.
   *
   * The grid positions each cell absolutely, so the DOM order decides nothing about the layout — and
   * everything about the tab order. Rendered in the order the page handed them over, tabbing through
   * a listing jumped around the screen, because that array is not the arrangement. buildGridLayout
   * returns its cards row by row, which is reading order, so following it lines the two up.
   */
  const cards = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task]))
    return layout.flatMap((item) => {
      const task = byId.get(item.i)
      return task ? [task] : []
    })
  }, [layout, tasks])

  /**
   * Puts the grid back on the arrangement the packer draws, when it is holding something else.
   *
   * react-grid-layout keeps its own layout state and adopts the `layout` prop only when that prop's
   * *value* changes. So a gesture that ends with nothing to store leaves the grid showing whatever
   * it compacted mid-gesture — its compaction packs upward only, where the packer here also fills
   * gaps sideways, so the two are not the same arrangement. Remounting is the one way to hand back
   * a layout that is, by definition, unchanged.
   *
   * Bumped only when the grid has actually drifted, which is rare: dropping a card somewhere the
   * packer cannot place it, so it goes back where it was. A drop that changes the order writes, the
   * prop changes, and the grid adopts it without any of this.
   */
  const [resyncKey, setResyncKey] = useState(0)
  const resyncIfDrifted = (shown: readonly LayoutItem[]) => {
    if (!sameArrangement(shown, layout)) {
      setResyncKey((key) => key + 1)
    }
  }

  /**
   * Saves only the card that was actually resized.
   *
   * Writing the whole layout back would store every other card's *derived* position and width as
   * though it had been chosen, which is how "resizing one card changes another's size" starts.
   * One gesture, one card, one write; everything else stays derived.
   *
   * The width arrives already snapped, because snapCardWidth quantised it while the pointer was
   * moving. Snapping again here costs nothing and keeps the stored value correct if that constraint
   * is ever reordered out of effect.
   */
  const persistResize = (shown: readonly LayoutItem[], resized: LayoutItem | null) => {
    if (!resized) {
      return
    }
    const wrote = updateTaskLayouts(scope, [
      {
        taskId: resized.i,
        placement: {
          w: snapWidth(resized.w, minWidthFor(cardsPerRow)),
          h: resized.h,
        },
      },
    ])
    if (!wrote) {
      resyncIfDrifted(shown)
    }
  }

  /**
   * A drop is stored as an order, not as a position.
   *
   * Which order is the whole question, and it used to be answered by reading the settled layout
   * top-to-bottom then left-to-right. That is a different algorithm from the one that draws the
   * arrangement, so the order stored was not a description of it — see orderAfterDrop, which
   * resolves the dropped cell through the packer itself instead.
   *
   * The order that comes back is this grid's, and a grid is not the listing: pinned cards are drawn
   * separately and the filters hide what they hide. Turning it into the listing's order is
   * rearrangeTasks' job, because only the context can see the cards that aren't on screen.
   *
   * Storing (x, y) instead would freeze the arrangement to the width it was made at and let a drop
   * leave holes behind it; an order goes back through the same first-fit packer as everything else,
   * which is what keeps rows filled without stretching anyone.
   */
  const persistOrder = (shown: readonly LayoutItem[], moved: LayoutItem | null) => {
    if (!moved) {
      return
    }
    // Where the card came to rest, not where the pointer was released: the grid may have shifted it
    // during compaction, and what the reader saw at release is the position they meant.
    const dropped = shown.find((item) => item.i === moved.i) ?? moved
    const visible = orderAfterDrop(tasks, cardsPerRow, scope, moved.i, {
      x: dropped.x,
      y: dropped.y,
    })
    if (!rearrangeTasks(scope, moved.i, visible)) {
      resyncIfDrifted(shown)
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'task-grid-canvas relative w-full',
        mirrored && 'task-grid-canvas--mirrored',
        className,
      )}
      style={
        arriveFrom === 'left' ? ({ '--grid-enter-x': `${mirrorX}px` } as CSSProperties) : undefined
      }
    >
      {/* Nothing is rendered until the width is known, so the guessed layout never reaches the
          screen and there is no relayout to watch. */}
      {mounted ? (
      <GridLayout
        // Remounts the grid when it has drifted off the packer's arrangement — see resyncIfDrifted.
        key={resyncKey}
        width={renderWidth}
        layout={layout}
        // Only for live feedback mid-resize — it shoves the overlapped neighbour down as you
        // pull. What is actually kept is re-flowed from scratch on release, so whatever this
        // leaves behind never becomes the arrangement.
        compactor={verticalCompactor}
        gridConfig={{
          cols: GRID_COLS,
          rowHeight: GRID_ROW_HEIGHT,
          margin: GRID_MARGIN,
          containerPadding: [0, 0],
        }}
        // Dragging is on, but only from the grip — and `handle` is what makes that safe rather
        // than a preference. react-draggable binds `touchstart` on every grid item with
        // { passive: false } and preventDefaults it, which is what stops the page scrolling from
        // there. With no handle that is the whole card, and cards cover nearly all of a phone
        // screen: a swipe was read as a drag, the card snapped back, and the page didn't move.
        // Its guard order is what rescues this — handleDragStart checks the handle selector and
        // returns *before* the preventDefault — so a touch anywhere but the grip is never
        // swallowed and still scrolls. Checked against the installed react-draggable, not assumed.
        dragConfig={{ enabled: true, handle: '.task-grid-drag-handle', threshold: 4 }}
        // Bottom-right only. Handles on all four corners were tried and dropped: three of them
        // reach into the space the neighbouring card occupies, which is exactly where they are
        // hardest to see and easiest to hit by accident, and none of them could do anything the
        // bottom-right one couldn't.
        resizeConfig={{ enabled: true, handles: ['se'] }}
        // The library's own two, plus width quantisation — see snapCardWidth. Passing this replaces
        // the defaults rather than adding to them, which is why gridBounds and minMaxSize are named
        // again here.
        constraints={CONSTRAINTS}
        onResizeStop={(shown, _oldItem, newItem) => persistResize(shown, newItem)}
        onDragStop={(shown, _oldItem, movedItem) => persistOrder(shown, movedItem)}
      >
        {cards.map((task) => (
          // RGL positions this element, so the card inside must fill it rather than size itself —
          // h-full on the wrapper is what makes a resized cell actually change the card.
          <div
            key={task.id}
            className="task-grid-cell"
            // Set on the cell rather than the card because the arcs are the card's *siblings* —
            // react-resizable clones them in here — so they can't inherit from it.
            style={{ '--task-grid-handle': handleColor?.(task) } as CSSProperties}
          >
            {children(task)}
            {/* The grip is the canvas's, not the card's: every view puts a different component in
                here, and a card that could be moved in one listing and not another would be the
                same card behaving two ways. Rendered after the card so it stacks above it without
                needing a z-index fight. */}
            <span
              className="task-grid-drag-handle"
              role="button"
              aria-label={`Move ${task.title}`}
              tabIndex={-1}
            />
          </div>
        ))}
      </GridLayout>
      ) : null}
    </div>
  )
}
