import { Children, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** The grid's row height. 1px because a row is only ever a unit of measurement here — a card spans
 *  as many of them as it is tall, so the packing is exact rather than rounded to a step. */
const ROW = 1

/**
 * Cards packed into columns with no gaps left under the short ones.
 *
 * Three ways to do this and two of them do not work here.
 *
 * A plain grid gives every card a cell, so a short card sitting beside a tall one leaves the
 * difference empty — which on this page was most of a column. Turning off `items-start` only trades
 * that for the same emptiness *inside* the short card.
 *
 * CSS columns are the shape that is meant for this, and they cannot be relied on: balancing works by
 * splitting content, `break-inside: avoid` forbids splitting, and a card too tall for what is left of
 * a column moves to the next one whole. One tall card is enough to end a column half a screen early
 * and stack everything else down the other one.
 *
 * So: a grid whose rows are one pixel tall, and each card told how many of them it covers. The
 * browser's own auto-placement then packs each card into the first column with room for it, which is
 * exactly the collage — and every card stays where it is in the DOM, so nothing is torn down and
 * rebuilt when the layout changes. That last part is why this is not done by sorting the cards into
 * column lists in script: moving a card to another column would remount it, and one of these cards is
 * a form somebody may be typing in.
 *
 * The heights have to be measured, so there is one layout pass before the spans are known. It runs in
 * useLayoutEffect, which is before the browser paints — the un-packed arrangement never reaches the
 * screen.
 */
export function Masonry({
  gap = 16,
  className,
  children,
}: {
  /** Vertical space between cards, in px. Kept as padding on each cell rather than as the grid's own
   *  row gap, which would be added between every one-pixel row. */
  gap?: number
  className?: string
  children: ReactNode
}) {
  // Falsy children are dropped, so a card that is only rendered inside a space does not leave a
  // measured hole behind when it isn't.
  const items = Children.toArray(children)
  const [spans, setSpans] = useState<number[]>([])
  const cells = useRef<Array<HTMLDivElement | null>>([])

  useLayoutEffect(() => {
    const measure = () => {
      const next = cells.current
        .slice(0, items.length)
        .map((cell) => Math.ceil((cell?.offsetHeight ?? 0) / ROW))
      // Compared before setting: a ResizeObserver fires on the layout its own callback caused, and
      // writing an identical array every time would be a loop rather than a measurement.
      setSpans((current) =>
        current.length === next.length && current.every((span, index) => span === next[index])
          ? current
          : next,
      )
    }

    measure()
    // Cards change height on their own — a theme picker opening, a font loading, a message
    // appearing — so this watches rather than measuring once.
    const observer = new ResizeObserver(measure)
    for (const cell of cells.current) {
      if (cell) {
        observer.observe(cell)
      }
    }
    return () => observer.disconnect()
  }, [items.length])

  const packed = spans.length === items.length

  return (
    <div
      className={cn('grid items-start gap-x-4 grid-cols-1', className)}
      // Only once every card has been measured. Before that the rows would be a pixel tall with
      // nothing spanning them, and every card would land on top of the last.
      style={packed ? { gridAutoRows: `${ROW}px` } : undefined}
    >
      {items.map((child, index) => (
        <div
          // The index is the key on purpose: these are a fixed list of settings cards in a fixed
          // order, and keying on it is what keeps a card in the same DOM node when the packing
          // changes around it.
          key={index}
          style={packed ? { gridRowEnd: `span ${spans[index]}` } : undefined}
        >
          <div
            ref={(node) => {
              cells.current[index] = node
            }}
            // The gap lives here, so what is measured is the card *and* the space under it — which
            // is what the span has to cover for the next card down to sit clear of it.
            style={{ paddingBottom: gap }}
          >
            {child}
          </div>
        </div>
      ))}
    </div>
  )
}
