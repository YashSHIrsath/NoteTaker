import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** 16px (the default, used everywhere else a checkbox sits beside 12–14px text) or 14px, for a
   *  spot as tight as ThemeSettings' quick-theme row, where a full-size box crowded the label
   *  above it. */
  size?: 'md' | 'sm'
}

const SIZE_CLASSES: Record<'md' | 'sm', string> = {
  md: 'h-4 w-4',
  sm: 'h-3.5 w-3.5',
}

/**
 * The app's own tick box: a real `<input type="checkbox">`, repainted rather than replaced.
 *
 * See `.app-checkbox` in index.css for the why and the how — this component exists only so every
 * place that wants one reaches for the class through a component instead of retyping it, the same
 * reason Button and IconButton wrap a plain `<button>`. A real input rather than a styled `<div>`
 * carries its own click target, Space-to-toggle and screen-reader "checked" state for free; a div
 * standing in for one would have to reimplement each of those by hand.
 */
export function Checkbox({ size = 'md', className, ...props }: CheckboxProps) {
  return (
    <input type="checkbox" className={cn('app-checkbox', SIZE_CLASSES[size], className)} {...props} />
  )
}
