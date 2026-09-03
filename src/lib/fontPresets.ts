import type { FontRole } from './fonts'

/**
 * Five whole looks, not five faces.
 *
 * Everything else in lib/fonts treats the three roles as independent — deliberately, because a
 * high-contrast serif that makes a beautiful heading is unreadable at 11px, and the ordinary case
 * is choosing each on its own merits. A preset is the opposite kind of choice: "reskin the whole
 * app in one press" only makes sense as a *coordinated* triple, picked so the three faces sit well
 * together — not the same triple everyone would reach by tuning each role in isolation.
 *
 * Curated toward the catalogue's own more considered picks rather than an arbitrary sample —
 * Manrope, Fraunces and Sora are each singled out elsewhere in this file for exactly the property
 * that makes them worth reaching for here (reads well at both a heading and a menu size, expensive-
 * looking at display size, holds up as a product face). "Premium" is a feeling, not a filter this
 * file can check, so the five below are a judgement call, not a formula.
 */
export interface FontPreset {
  id: string
  label: string
  body: string
  heading: string
  note: string
}

export const FONT_PRESETS: FontPreset[] = [
  { id: 'modern', label: 'Modern', body: 'inter', heading: 'manrope', note: 'kalam' },
  { id: 'editorial', label: 'Editorial', body: 'source-serif', heading: 'fraunces', note: 'kalam' },
  { id: 'studio', label: 'Studio', body: 'space-grotesk', heading: 'sora', note: 'shantell-sans' },
  { id: 'architect', label: 'Architect', body: 'outfit', heading: 'playfair', note: 'caveat' },
  { id: 'legible', label: 'Legible', body: 'atkinson', heading: 'dm-serif', note: 'gloria-hallelujah' },
]

/** The triple, keyed the way updateProfile's `fonts` field and readFontChoice both want it. */
export function presetTriple(preset: FontPreset): Record<FontRole, string> {
  return { body: preset.body, heading: preset.heading, note: preset.note }
}

/**
 * Which preset an account's current three choices amount to, if any.
 *
 * Exact match on all three, not "close enough" — a preset is a specific combination, and a triple
 * that agrees with Modern on two faces and Editorial on the third is neither, which is exactly
 * right: it is whatever somebody built by hand in Settings, and pressing the cycle button from
 * there should not silently claim it as one of the five.
 */
export function currentFontPreset(triple: Record<FontRole, string>): FontPreset | undefined {
  return FONT_PRESETS.find(
    (preset) =>
      preset.body === triple.body && preset.heading === triple.heading && preset.note === triple.note,
  )
}

/**
 * The next preset along the circle, for the header's cycle button.
 *
 * A hand-built combination — the current triple matches none of the five — starts the circle over
 * at the first preset rather than trying to place it "between" two of them; unlike a single-axis
 * choice (a theme, a face for one role), three faces at once have no natural notion of which
 * preset a custom mix sits nearest to.
 */
export function nextFontPreset(triple: Record<FontRole, string>): FontPreset {
  const current = currentFontPreset(triple)
  if (!current) {
    return FONT_PRESETS[0]!
  }
  const at = FONT_PRESETS.findIndex((preset) => preset.id === current.id)
  return FONT_PRESETS[(at + 1) % FONT_PRESETS.length]!
}
