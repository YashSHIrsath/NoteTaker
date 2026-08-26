import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { GridLayout, useContainerWidth, verticalCompactor, type LayoutItem } from 'react-grid-layout'
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
  orderFromLayout,
  snapWidth,
} from '../../lib/taskGrid'
import { cn } from '../../lib/cn'

/** Kept only as the value react-grid-layout falls back to; nothing is painted at it. */
const INITIAL_WIDTH = 1280

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
 * Cards cannot be dragged, only resized — see the note on dragConfig below for why that is a
 * requirement rather than a preference. Reordering lives where it always did: a card's position
 * follows the order it was created in, and the ⋮-less move button sends it to another folder.
 */
export function TaskGridCanvas({ tasks, scope, children, handleColor, className }: TaskGridCanvasProps) {
  const { updateTaskLayouts } = useFolders()
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
   * Saves on gesture end, not on every layout change. onLayoutChange also fires on mount and on
   * any re-render, and writing there would persist the layout the grid was just handed — turning
   * every render into a save.
   */
  /**
   * Saves only the card that was actually resized.
   *
   * Writing the whole layout back would store every other card's *derived* position and width as
   * though it had been chosen, which is how "resizing one card changes another's size" starts.
   * One gesture, one card, one write; everything else stays derived.
   *
   * The width is snapped to a whole unit on the way in rather than on the way out, so what gets
   * stored is what will be rendered — no drift between the two.
   */
  const persistResize = (resized: LayoutItem | null) => {
    if (!resized) {
      return
    }
    updateTaskLayouts(scope, [
      {
        taskId: resized.i,
        placement: {
          w: snapWidth(resized.w, minWidthFor(cardsPerRow)),
          h: resized.h,
        },
      },
    ])
  }

  /**
   * A drop is stored as an order, not as a position.
   *
   * Where the card landed is read off the settled layout in reading order — down the rows, then
   * across — and every card in this listing gets its index written, because an order only means
   * anything relative to the others. Nothing else about them is touched, so a card that has never
   * been resized still takes its width from the "cards per row" setting.
   *
   * Storing (x, y) instead would freeze the arrangement to the width it was made at and let a
   * drop leave holes behind it; an order goes back through the same first-fit packer as
   * everything else, which is what keeps rows filled without stretching anyone.
   */
  const persistOrder = (settled: readonly LayoutItem[]) => {
    const order = orderFromLayout(settled)
    updateTaskLayouts(
      scope,
      [...order].map(([taskId, index]) => ({ taskId, placement: { order: index } })),
    )
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
        onResizeStop={(_layout, _oldItem, newItem) => persistResize(newItem)}
        onDragStop={(settled) => persistOrder(settled)}
      >
        {tasks.map((task) => (
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
