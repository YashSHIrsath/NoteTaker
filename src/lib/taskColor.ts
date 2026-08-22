import type { TaskColor, TaskPaletteColor } from '../types'
import { categoryVar, type FolderCategory } from './folderColor'

/**
 * Colors a task card can be set to. The first five are the folder categories (so a color stored
 * before the palette grew still resolves); the rest exist only for tasks, since a task's color is
 * a free choice and doesn't have to come from the folder color cycle.
 *
 * Order is the picker's order: warm through cool, neutral last.
 */
export const TASK_PALETTE = [
  'rose',
  'pink',
  'orange',
  'amber',
  'lime',
  'emerald',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'slate',
] as const satisfies readonly TaskPaletteColor[]

const HEX_PATTERN = /^#[0-9a-f]{6}$/i

export function isPaletteColor(value: string): value is TaskPaletteColor {
  return (TASK_PALETTE as readonly string[]).includes(value)
}

export function isCustomColor(value: string): boolean {
  return HEX_PATTERN.test(value)
}

/** What may be persisted in Task.color — anything else is treated as "no choice". */
export function isTaskColor(value: unknown): value is TaskColor {
  return typeof value === 'string' && (isPaletteColor(value) || isCustomColor(value))
}

export interface TaskColorStyle {
  /** Card fill. */
  card: string
  /** Text/icon color that reads on top of `card`, and the base for tints derived from it. */
  ink: string
  /** The saturated form, for the picker swatch and small solid marks. */
  solid: string
}

function paletteStyle(name: TaskPaletteColor): TaskColorStyle {
  return {
    card: `var(--task-${name}-card)`,
    ink: `var(--task-${name}-ink)`,
    solid: `var(--task-${name}-solid)`,
  }
}

function hexLuminance(hex: string): number {
  const value = hex.slice(1)
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Resolves a task's stored color (or the view's fallback category) into the three CSS values a
 * card needs.
 *
 * A palette entry maps to its own light/dark variables, so it stays legible when the theme flips.
 * A custom hex is one fixed fill in both themes — there's no second value to switch to — so its
 * ink is picked by luminance instead, which is what keeps text readable on any chosen color.
 */
export function taskColorStyle(color: TaskColor | null, fallback: FolderCategory): TaskColorStyle {
  if (color && isCustomColor(color)) {
    const light = hexLuminance(color) > 0.45
    return {
      card: color,
      ink: light ? '#10131a' : '#ffffff',
      solid: color,
    }
  }
  if (color && isPaletteColor(color)) {
    return paletteStyle(color)
  }
  // No explicit choice: the view decides, exactly as it did before the picker existed.
  return {
    card: categoryVar(fallback, 'card'),
    ink: categoryVar(fallback, 'ink'),
    solid: categoryVar(fallback),
  }
}

/** Swatch fill for a palette entry, for the picker. */
export function paletteSwatch(name: TaskPaletteColor): string {
  return `var(--task-${name}-solid)`
}
