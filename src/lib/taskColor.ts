import type { CSSProperties } from 'react'
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

/** Relative luminance, 0–1. Exported because the custom theme decides whether it is a light or a
 *  dark theme from the ground somebody picked — see lib/themes.ts. */
export function hexLuminance(hex: string): number {
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

/**
 * Where each palette entry sits on the color wheel, in degrees.
 *
 * Only `randomTaskColor` reads these. The swatches themselves are CSS variables, which JS can't
 * measure until they're painted, so the angles are written down here — they're what keeps a
 * random color off the twelve colors the picker already offers.
 */
const PALETTE_HUES: Record<TaskPaletteColor, number> = {
  rose: 350,
  pink: 330,
  orange: 25,
  amber: 38,
  lime: 85,
  emerald: 160,
  teal: 175,
  cyan: 190,
  blue: 217,
  indigo: 239,
  violet: 258,
  slate: 215,
}

/** How far a random hue must stay from every palette hue, in degrees. Below about 12° two colors
 *  read as the same one side by side, which would make the roll look broken rather than random. */
const MIN_HUE_GAP = 16

/** Kept away from washed-out and near-black: the card is a solid fill of this color, and both
 *  extremes make one indistinguishable from the surface behind it. */
const RANDOM_SATURATION = { min: 52, span: 34 }
const RANDOM_LIGHTNESS = { min: 44, span: 22 }

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100
  const l = lightness / 100
  const amplitude = s * Math.min(l, 1 - l)
  const channel = (offset: number): string => {
    const k = (offset + hue / 30) % 12
    const value = l - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

/** Hue of a `#rrggbb`, in degrees. Grey has no hue; 0 is as good an answer as any. */
export function hexHue(hex: string): number {
  const [r = 0, g = 0, b = 0] = [0, 2, 4].map(
    (offset) => parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255,
  )
  const max = Math.max(r, g, b)
  const span = max - Math.min(r, g, b)
  if (span === 0) {
    return 0
  }
  const sixth = max === r ? (g - b) / span : max === g ? (b - r) / span + 2 : (r - g) / span + 4
  return ((sixth * 60) % 360 + 360) % 360
}

/**
 * A color the palette doesn't offer — the "surprise me" next to the twelve swatches.
 *
 * Rather than rolling a hue and re-rolling until one happens to miss the palette, this measures
 * the arcs *between* the palette hues and lands inside one of them, picked in proportion to its
 * width so no gap is favoured. That terminates in one pass and can't return a near-copy of a
 * swatch. `avoid` (the color already on the card) is treated as a thirteenth hue to steer around,
 * so rolling again always visibly changes something.
 */
export function randomTaskColor(avoid: TaskColor | null = null): string {
  const hues = Object.values(PALETTE_HUES)
  if (avoid && isCustomColor(avoid)) {
    hues.push(hexHue(avoid))
  }
  const sorted = [...hues].sort((a, b) => a - b)

  const arcs = sorted
    .map((start, index) => {
      const next = sorted[(index + 1) % sorted.length] ?? start
      // Wrapping past 360 is what makes the arc from the last hue back to the first a real gap
      // rather than a negative one.
      const span = ((next - start + 360) % 360) || 360
      return { start, width: span - MIN_HUE_GAP * 2 }
    })
    .filter((arc) => arc.width > 0)

  // Only reachable if the palette ever grew dense enough to close every gap; an unconstrained hue
  // beats throwing at the one moment somebody asked for a color.
  let hue = Math.random() * 360
  if (arcs.length > 0) {
    const total = arcs.reduce((sum, arc) => sum + arc.width, 0)
    let cursor = Math.random() * total
    let chosen = arcs[arcs.length - 1]!
    for (const arc of arcs) {
      if (cursor < arc.width) {
        chosen = arc
        break
      }
      cursor -= arc.width
    }
    hue = (chosen.start + MIN_HUE_GAP + Math.random() * chosen.width) % 360
  }

  return hslToHex(
    hue,
    RANDOM_SATURATION.min + Math.random() * RANDOM_SATURATION.span,
    RANDOM_LIGHTNESS.min + Math.random() * RANDOM_LIGHTNESS.span,
  )
}

/**
 * The strip of cellotape a colourful card wears at the top edge — see TaskCard and AllTaskTile,
 * the two places a card is ever actually shown as a coloured sticky note.
 *
 * One shared constant rather than the same object written twice, since a card looking like tape
 * and a card looking like a translucent grey smear is a difference of one number, and the two
 * places it is used should never drift apart on that number by accident.
 *
 * Real tape is closer to a material than a colour: mostly see-through, with a diagonal streak
 * where the light catches its glossy surface. A flat translucent white (the first version of
 * this) was legible but read as a plain smear — the gradient's brighter middle band is what turns
 * that into a sheen, and the thin light border is what keeps the tape's own edges visible even
 * where it happens to be sitting over something equally pale.
 */
export const TASK_TAPE_STYLE: CSSProperties = {
  background:
    'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.4) 38%, rgba(255,255,255,0.16) 52%, rgba(255,255,255,0.24) 100%)',
  border: '1px solid rgba(255,255,255,0.35)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
}

/**
 * The round head of a real pushpin — the part you actually see once one is pressed in, which is
 * why this stops there rather than drawing a needle underneath it too. A flat icon (the first
 * version of this, Lucide's own Pin glyph filled solid) read as a picture of a pin; a sphere lit
 * from one corner reads as an object, which is the difference this exists to make.
 *
 * Three things do that work. The radial gradient is a bright glint near the top-left fading
 * through the pin's own colour to a darkened edge — the same trick a favicon or an app-icon dot
 * uses to look like a bead rather than a flat circle. The inset shadow along the bottom is what
 * curls that edge under, the way the far side of a real dome falls into its own shade. And the
 * drop shadow outside it is cast on the note underneath, which is what tells you the pin is
 * *sitting on* the paper rather than printed on it.
 *
 * A function of the note's own colour, not one fixed shade: a card is drawn in `colors.solid` —
 * the saturated form of whichever colour the note is set to, the same value its picker swatch
 * uses — so a pin on a green note is a green pin and one on a pink note is a pink one, matching
 * the card it is stuck to rather than standing out from every single one in the same purple.
 */
export function taskPinStyle(solid: string): CSSProperties {
  return {
    background: `radial-gradient(circle at 32% 28%, color-mix(in oklab, ${solid} 45%, white) 0%, ${solid} 55%, color-mix(in oklab, ${solid} 65%, black) 100%)`,
    boxShadow: '0 3px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 3px rgba(0, 0, 0, 0.3)',
  }
}
