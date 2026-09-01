import { cn } from '../../lib/cn'

export interface LogoLoaderProps {
  /** 'md' for a full-page splash, 'sm' to sit inline beside text. */
  size?: 'sm' | 'md'
  /**
   * 0–1 fills the bars instead of playing them: the same mark used as a meter.
   *
   * The pull-to-refresh gesture drives it, so what appears under your finger is the thing that
   * then starts playing when the read begins — one object in two states, rather than a progress
   * widget that gets swapped out for the mark. Omit it for the ordinary waiting state.
   */
  progress?: number
  className?: string
}

/**
 * The waiting state of the Mindstack mark: its bars, playing.
 *
 * The mark is a bar chart, so the obvious loading animation is the bars moving — it says "this
 * app, working" where a generic ring says nothing. It isn't the real mark's geometry, though: the
 * logo is a *stacked* chart (bars 1/5/6 are segments that stop mid-column), and scaling those from
 * their own baselines pulls the shape apart. So this keeps the mark's proportions — the 28:11
 * width-to-gap ratio, the same uneven column heights — on one shared baseline, which is what
 * animates cleanly.
 *
 * Under prefers-reduced-motion the bars simply hold their resting heights, which still reads as
 * the mark rather than as a broken widget.
 */

/** Resting heights, as a share of the box. Uneven like the real mark, not a smooth ramp. */
const BARS = [0.45, 0.75, 1, 0.6, 0.85]

/** Spread over roughly half the cycle, so the wave travels rather than pulsing in unison. */
const STAGGER_MS = 110

/** The same travelling wave the animation has, expressed against a filling meter: each bar takes
 *  its share a little after the one to its left, so the mark builds left to right instead of every
 *  column growing in lockstep. */
const FILL_STAGGER = 0.12
const FILL_SPAN = 0.5

/** What a bar keeps when the meter reads zero. Enough to still be the mark, not a row of dots. */
const FILL_FLOOR = 0.28

function fillFor(index: number, progress: number): number {
  const share = (progress - index * FILL_STAGGER) / FILL_SPAN
  return Math.max(0, Math.min(1, share))
}

export function LogoLoader({ size = 'md', progress, className }: LogoLoaderProps) {
  const small = size === 'sm'
  const metered = typeof progress === 'number'

  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-flex items-end',
        small ? 'h-4 gap-[2px]' : 'h-8 gap-[3px]',
        className,
      )}
    >
      {BARS.map((height, index) => {
        const fill = metered ? fillFor(index, progress) : 1
        return (
          <span
            key={index}
            aria-hidden
            className={cn(
              'block rounded-full bg-current',
              // A metered bar is being dragged, not played: it has to track the finger, so it gets
              // no keyframes and only a short catch-up transition.
              metered ? 'transition-[height,opacity] duration-100 ease-out motion-reduce:transition-none' : 'anim-loader-bar',
              small ? 'w-[3px]' : 'w-[6px]',
            )}
            style={{
              height: `${height * (metered ? FILL_FLOOR + (1 - FILL_FLOOR) * fill : 1) * 100}%`,
              opacity: metered ? 0.5 + 0.5 * fill : undefined,
              animationDelay: metered ? undefined : `${index * STAGGER_MS}ms`,
            }}
          />
        )
      })}
    </span>
  )
}
