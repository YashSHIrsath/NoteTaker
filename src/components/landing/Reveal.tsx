import type { ReactNode } from 'react'
import { useReveal } from '../../hooks/useLandingScroll'
import { cn } from '../../lib/cn'

/**
 * Which way a thing arrives from.
 *
 * More than one, deliberately. A page where every block fades up the same distance reads as a single
 * effect applied indiscriminately — the eye learns it in two sections and stops seeing it. Giving a
 * section a direction that means something (a left column from the left, a figure from its own side,
 * a heading scaling up rather than sliding) is the difference between animation and decoration.
 */
export type RevealFrom = 'up' | 'down' | 'left' | 'right' | 'scale' | 'blur'

const HIDDEN: Record<RevealFrom, string> = {
  up: 'translate-y-8 opacity-0',
  down: '-translate-y-6 opacity-0',
  left: '-translate-x-10 opacity-0',
  right: 'translate-x-10 opacity-0',
  scale: 'scale-[0.94] opacity-0',
  blur: 'opacity-0 blur-[6px]',
}

export interface RevealProps {
  children: ReactNode
  from?: RevealFrom
  /** Milliseconds, for staggering siblings. Kept small — a stagger you can count is a stagger too
   *  long, and it delays content somebody is already looking at. */
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li'
}

export function Reveal({ children, from = 'up', delay = 0, className, as = 'div' }: RevealProps) {
  const { ref, shown } = useReveal()
  const Tag = as

  return (
    <Tag
      ref={ref as never}
      className={cn(
        /*
         * The three properties the reveal actually moves, rather than `all`.
         *
         * `all` also meant every colour on the block re-animated for 680ms on a theme change —
         * underneath the theme's own reveal, which is already drawing over the whole screen.
         *
         * And no `will-change`. It was on every one of these permanently, which is a compositor
         * layer per revealed block, held for the life of the page whether the block had animated
         * yet or not. A browser promotes an element with a running transform transition by itself
         * and drops the layer when the transition ends — the same benefit, without the page going
         * on paying for it in memory and composite time long after nothing is moving.
         */
        'transition-[transform,opacity,filter] duration-[680ms]',
        '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
        // Reduced motion resolves `shown` immediately and this class removes the transition, so the
        // content is simply there — no movement, and no delay before it appears either.
        'motion-reduce:transition-none',
        shown ? 'translate-x-0 translate-y-0 scale-100 opacity-100 blur-0' : HIDDEN[from],
        className,
      )}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </Tag>
  )
}
