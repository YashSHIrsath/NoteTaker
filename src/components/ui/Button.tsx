import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type ButtonVariant = 'ghost' | 'subtle' | 'primary' | 'danger'
type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  ghost: 'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-hover)]',
  // --color-surface-muted sits too close to the page background in both themes to read as a
  // button on its own — border-[var(--color-border-strong)] plus a --color-hover fill gives it
  // a real, visible edge instead of blending into whatever it's placed on.
  subtle:
    'border border-[var(--color-border-strong)] bg-[var(--color-hover)] text-[var(--color-text)] hover:bg-[var(--color-border)]',
  primary: 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90',
  danger: 'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)]',
}

/*
 * Smaller below `sm`, full size from there up.
 *
 * Both of these were `text-sm` — 14px — at every width, so "small" and "medium" differed only in
 * padding and nothing shrank on a phone. Next to the 11-12px helper text these buttons sit beside
 * in cards, a 14px label with desktop padding is the thing that reads as oversized, and three of
 * them in a row is what pushed the space panel's picture controls onto their own lines.
 *
 * Only the mobile end moves. A wide screen keeps exactly the sizes it had.
 */
const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-[12.5px] sm:py-1.5 sm:text-sm',
  md: 'px-3 py-1.5 text-[13px] sm:py-2 sm:text-sm',
}

export function Button({
  children,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'anim-press inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
