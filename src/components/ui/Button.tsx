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

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
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
