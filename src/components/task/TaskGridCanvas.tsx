import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { GridLayout, useContainerWidth, verticalCompactor, type LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './TaskGridCanvas.css'
import type { Task } from '../../types'
import { useFolders } from '../../hooks/useFolders'
import { useCardsPerRow } from '../../hooks/useTileGrid'
import { GRID_COLS, GRID_MARGIN, GRID_ROW_HEIGHT, buildGridLayout, minWidthFor, snapWidth } from '../../lib/taskGrid'
import { cn } from '../../lib/cn'

export interface TaskGridCanvasProps {
  tasks: Task[]
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
export function TaskGridCanvas({ tasks, children, handleColor, className }: TaskGridCanvasProps) {
  const { updateTaskLayouts } = useFolders()
  const { width, containerRef } = useContainerWidth({ initialWidth: 1280 })
  const cardsPerRow = useCardsPerRow()

  const layout = useMemo(() => buildGridLayout(tasks, cardsPerRow), [tasks, cardsPerRow])

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
  const persist = (resized: LayoutItem | null) => {
    if (!resized) {
      return
    }
    updateTaskLayouts([
      {
        taskId: resized.i,
        // x and y are recorded but never read back — buildGridLayout places every card itself.
        // Kept in the shape so the stored row stays self-describing rather than half-filled.
        layout: {
          x: resized.x,
          y: resized.y,
          w: snapWidth(resized.w, minWidthFor(cardsPerRow)),
          h: resized.h,
        },
      },
    ])
  }

  return (
    <div ref={containerRef} className={cn('task-grid-canvas relative w-full', className)}>
      <GridLayout
        width={width}
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
        // Dragging is off, and it has to be: react-draggable binds `touchstart` on every grid
        // item with { passive: false } and preventDefaults the touchmove that follows, so a
        // finger that lands on a card can never scroll the page. Cards cover nearly all of it,
        // which made the page unscrollable on a phone — a swipe was read as a drag, the card
        // snapped back, and nothing moved. Resizing is unaffected: its handle is a 28px corner
        // with its own listener, not the whole card.
        dragConfig={{ enabled: false }}
        // Bottom-right only. Handles on all four corners were tried and dropped: three of them
        // reach into the space the neighbouring card occupies, which is exactly where they are
        // hardest to see and easiest to hit by accident, and none of them could do anything the
        // bottom-right one couldn't.
        resizeConfig={{ enabled: true, handles: ['se'] }}
        onResizeStop={(_layout, _oldItem, newItem) => persist(newItem)}
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
          </div>
        ))}
      </GridLayout>
    </div>
  )
}
