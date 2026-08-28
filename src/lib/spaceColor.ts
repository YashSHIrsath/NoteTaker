import type { CSSProperties } from 'react'
import { isPaletteColor, TASK_PALETTE } from './taskColor'
import type { TaskPaletteColor } from '../types'

/**
 * The colours a space can be, which are the colours the app already has.
 *
 * Reusing the task palette rather than inventing a second one: every name here already carries
 * proper light and dark values as `--task-*` tokens, so a space's colour works in both themes
 * without a single new variable.
 */
export const SPACE_COLORS = TASK_PALETTE

export function isSpacePaletteColor(value: unknown): value is TaskPaletteColor {
  return typeof value === 'string' && isPaletteColor(value)
}

/** A stable colour for a space that was never given one, so the identity still works. Derived from
 *  the id, so it is the same on every device and never shifts. */
export function spaceColorFor(id: string, chosen: TaskPaletteColor | null): TaskPaletteColor {
  if (chosen) {
    return chosen
  }
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100000
  }
  return SPACE_COLORS[hash % SPACE_COLORS.length] ?? 'indigo'
}

/**
 * The space's colour, applied to the whole shell.
 *
 * A safety feature that happens to look good. Once a shared workspace renders through exactly the
 * same screens as your own notes, "which one am I in" becomes a real question with a costly wrong
 * answer — deleting a client's note believing it was yours.
 *
 * Two layers. The accent tokens repoint every button, focus ring and nav indicator in the app, since
 * they all read these variables and nothing has to opt in. And `--space-tint` drives .space-theme,
 * which mixes the same colour into the *surfaces* — because the accent alone shows on a handful of
 * controls, and a whole screen of otherwise-white cards still reads as your own notes.
 *
 * Personal notes set nothing and keep the app's own indigo on its own grounds.
 */
export function spaceAccentStyle(id: string, chosen: TaskPaletteColor | null): CSSProperties {
  const color = spaceColorFor(id, chosen)
  return {
    // The one value the whole space theme derives from — see .space-theme in index.css, which mixes
    // it into the surfaces for light and dark separately.
    '--space-tint': `var(--task-${color}-solid)`,
    '--color-accent': `var(--task-${color}-solid)`,
    '--color-accent-hover': `var(--task-${color}-solid)`,
    '--color-accent-soft': `var(--task-${color}-card)`,
    '--color-accent-soft-hover': `var(--task-${color}-card)`,
    '--color-accent-ink': `var(--task-${color}-ink)`,
  } as CSSProperties
}

/** A single swatch, for the colour picker and the space cards. */
export function spaceSwatch(color: TaskPaletteColor): string {
  return `var(--task-${color}-solid)`
}
