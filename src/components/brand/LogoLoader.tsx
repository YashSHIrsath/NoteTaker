import { cn } from '../../lib/cn'

export interface LogoLoaderProps {
  /** 'md' for a full-page splash, 'sm' to sit inline beside text. */
  size?: 'sm' | 'md'
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

export function LogoLoader({ size = 'md', className }: LogoLoaderProps) {
  const small = size === 'sm'

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
      {BARS.map((height, index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            'anim-loader-bar block rounded-full bg-current',
            small ? 'w-[3px]' : 'w-[6px]',
          )}
          style={{
            height: `${height * 100}%`,
            animationDelay: `${index * STAGGER_MS}ms`,
          }}
        />
      ))}
    </span>
  )
}
