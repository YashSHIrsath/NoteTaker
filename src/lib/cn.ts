/**
 * Joins class names, omitting falsy values.
 * Lightweight alternative to clsx for simple conditional classes.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
