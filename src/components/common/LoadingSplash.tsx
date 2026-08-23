import { LogoLoader } from '../brand/LogoLoader'
import { cn } from '../../lib/cn'

export interface LoadingSplashProps {
  /** Said out loud to screen readers and shown under the mark. Keep it to what's being waited on. */
  label?: string
  className?: string
}

/**
 * The whole-screen wait: session check, first data load. One component so every one of them looks
 * the same, instead of each caller centring its own bare "Loading…".
 *
 * `anim-delayed-in` is the important part — it holds the splash invisible for its first fraction
 * of a second. Most of these waits resolve in well under that, and a loader that appears and
 * vanishes inside 100ms reads as a flicker of broken layout. Slow loads still get it, on time.
 */
export function LoadingSplash({ label = 'Loading', className }: LoadingSplashProps) {
  return (
    <div
      className={cn(
        'anim-delayed-in flex h-full flex-col items-center justify-center gap-4 bg-[var(--color-surface)]',
        className,
      )}
    >
      <LogoLoader className="text-[var(--color-accent)]" />
      <p className="text-[13px] font-medium tracking-wide text-[var(--color-text-muted)]">{label}</p>
    </div>
  )
}
