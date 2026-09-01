/**
 * The themes the app can be set in, and which of them the header offers.
 *
 * Two of these are the reader's own answer to "what does my room look like" — light and dark, one of
 * which the operating system has already picked for them. The other three are the app's answer, and
 * exist because "no opinion" was the only opinion the product had: both original ramps are cool
 * greys, while the favicon has always drawn the mark on a *warm* near-black. The brand and the
 * product disagreed about the ground, and a signature theme is where that gets settled.
 *
 * What a signature theme is not, here: a new accent colour. A note carries one of twelve fills from a
 * real palette, deliberately vivid (see index.css on why the pale ones were abandoned), so every
 * surface around a note is a neutral and has to stay one. These themes are rooms, not repaints.
 *
 * `custom` is the exception that proves it. It is allowed to be loud, and it was still measured
 * against the notes before it was allowed anything — see CUSTOM_DEFAULT.
 */

import { hexLuminance } from './taskColor'

export type ThemeId = 'light' | 'dark' | 'paper' | 'studio' | 'indigo' | 'custom'

/** The two colours the custom theme is made of. Everything else is mixed from them. */
export interface CustomColors {
  /** The page. Also decides whether this counts as a light or a dark theme. */
  ground: string
  /** The one colour the app spends on anything that matters. */
  accent: string
}

/** Where a theme came from — the two headings the settings screen groups them under. */
export type ThemeFamily = 'system' | 'signature'

export interface ThemeOption {
  id: ThemeId
  /** True for the one theme whose colours are the reader's rather than ours — see customThemeVars.
   *  Its `dark` below is only the default's family; the real one follows the ground they pick. */
  editable?: boolean
  label: string
  /** One line, in the words of somebody choosing. Not "warm-neutral low-chroma near-black". */
  hint: string
  family: ThemeFamily
  /**
   * Whether it belongs to the dark family.
   *
   * Load-bearing rather than descriptive. Everything that has to know light from dark reads this —
   * the note palette's selector in index.css, the native status bar's icon colour, how heavily a
   * shared space tints the grounds, and which mode the note editor is handed. Before this there were
   * two themes and every one of those places asked `theme === 'dark'`, which is the question that
   * stops being answerable the moment a third dark theme exists.
   */
  dark: boolean
  /**
   * The three colours the picker draws this theme with.
   *
   * Duplicated from index.css, and unavoidably: a swatch has to show a theme the document is *not*
   * currently in, so it cannot read the tokens off `:root` — there is only ever one theme's values
   * there. Kept to three so the duplication stays small enough to notice when it drifts, and checked
   * for distinctness so two themes can never render as the same chip.
   */
  swatch: { ground: string; ink: string; accent: string }
}

/**
 * The two colours the custom theme is built from, and what it looks like before anybody touches it.
 *
 * Grape soda: a saturated purple room with an electric mint accent. Loud on purpose — it is the one
 * theme allowed to be — and measured before it was allowed to be: the dark note fills separate from
 * this ground at 1.36 against the 1.33 the plain dark theme gives them, so the notes lose nothing to
 * it. The same values are in index.css, which is what makes `custom` a real theme with no stored
 * colours at all.
 */
export const CUSTOM_DEFAULT: CustomColors = { ground: '#1a0b33', accent: '#3ff0d0' }

export const THEMES: readonly ThemeOption[] = [
  {
    id: 'light',
    label: 'Light',
    hint: 'The original. Cool greys, white cards, indigo.',
    family: 'system',
    dark: false,
    swatch: { ground: '#f8f9fb', ink: '#14161a', accent: '#4f46e5' },
  },
  {
    id: 'dark',
    label: 'Dark',
    hint: 'The original after hours. Blue-black, the same indigo lifted.',
    family: 'system',
    dark: true,
    swatch: { ground: '#15161b', ink: '#edeef2', accent: '#8b85f0' },
  },
  {
    id: 'paper',
    label: 'Paper',
    hint: 'A notebook. Oat chrome, white pages, ink-black type — the one that answers the serif.',
    family: 'signature',
    dark: false,
    swatch: { ground: '#faf6ef', ink: '#211c15', accent: '#4f46e5' },
  },
  {
    id: 'studio',
    label: 'Studio',
    hint: 'A desk lamp at night. The warm near-black the app’s own icon already sits on.',
    family: 'signature',
    dark: true,
    swatch: { ground: '#141412', ink: '#f0eee8', accent: '#a9a2f7' },
  },
  {
    id: 'indigo',
    label: 'Indigo',
    hint: 'The mark’s colour as the room. The most this app has ever looked like itself.',
    family: 'signature',
    dark: true,
    swatch: { ground: '#12101c', ink: '#eceaf6', accent: '#9d95ff' },
  },
  {
    id: 'custom',
    label: 'Custom',
    hint: 'Grape soda, out of the box — and the one theme you can repaint. Pick a page and an accent.',
    family: 'signature',
    editable: true,
    dark: true,
    swatch: { ground: CUSTOM_DEFAULT.ground, ink: '#fbf2ff', accent: CUSTOM_DEFAULT.accent },
  },
]

const BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]))

export const DEFAULT_LIGHT: ThemeId = 'light'
export const DEFAULT_DARK: ThemeId = 'dark'

/** A theme by id, or the light default. Never null: a hand-edited or older stored value must not
 *  leave the app with no theme at all. */
export function themeOption(id: string | null | undefined): ThemeOption {
  return (id ? BY_ID.get(id as ThemeId) : undefined) ?? BY_ID.get(DEFAULT_LIGHT)!
}

/** The one question everything outside this file used to ask as `theme === 'dark'`. */
export function isDarkTheme(id: string | null | undefined): boolean {
  return themeOption(id).dark
}

/** The stored choice, or the one the operating system has already made. */
export function readTheme(raw: string | null, systemPrefersDark: boolean): ThemeId {
  if (raw && BY_ID.has(raw as ThemeId)) {
    return raw as ThemeId
  }
  return systemPrefersDark ? DEFAULT_DARK : DEFAULT_LIGHT
}

/**
 * Which themes the header's switcher offers.
 *
 * `null` — nothing stored — means all of them, which is the default and the state a new account is
 * in. An empty *string* is different and means the reader has unchecked everything on purpose, so it
 * stays empty rather than helpfully resetting to all; unchecking something that re-checks itself is
 * worse than a switcher with nothing in it.
 *
 * Unknown ids are dropped and the result is put back into catalogue order, so the strip reads the
 * same way as the settings list however the value was written.
 */
export function readQuickThemes(raw: string | null): ThemeId[] {
  if (raw === null) {
    return THEMES.map((theme) => theme.id)
  }
  const wanted = new Set(raw.split(',').map((part) => part.trim()))
  return THEMES.filter((theme) => wanted.has(theme.id)).map((theme) => theme.id)
}

export function writeQuickThemes(ids: readonly ThemeId[]): string {
  return readQuickThemes(ids.join(',')).join(',')
}

/**
 * What the switcher actually shows: the chosen ones, plus whatever theme is in force.
 *
 * The current theme is always in the list even when it is unchecked, because a menu that doesn't
 * contain the theme you are looking at is a menu that lies about where you are — and it would also
 * be the one theme you could not leave from there.
 */
export function quickThemes(quick: readonly ThemeId[], current: ThemeId): ThemeOption[] {
  const shown = new Set<ThemeId>([...quick, current])
  return THEMES.filter((theme) => shown.has(theme.id))
}

/**
 * The next theme along, for every control that presses rather than picks — the header button, the
 * landing bar's, and the command palette's "switch theme".
 *
 * Falls back to the whole catalogue when the shortlist holds fewer than two, so unchecking
 * everything quiets the menu without leaving those three controls with nowhere to go.
 */
export function nextTheme(quick: readonly ThemeId[], current: ThemeId): ThemeId {
  const ring = quickThemes(quick, current)
  const list = ring.length >= 2 ? ring : [...THEMES]
  const at = list.findIndex((theme) => theme.id === current)
  return list[(at + 1) % list.length]!.id
}

/* ------------------------------------------------------------------- the custom theme */

const HEX = /^#[0-9a-f]{6}$/i

/** Below this a ground counts as dark, and the app hands it the dark note palette and light type.
 *  0.22 rather than 0.5: a mid-tone ground still needs pale text over it, and the fills the notes
 *  carry are drawn for a dark room long before a ground gets literally half-way to white. */
const DARK_GROUND_BELOW = 0.22

/**
 * Which family a custom ground belongs to.
 *
 * This is the question the note palette's CSS selector cannot answer for itself — `custom` is one
 * theme id with two possible answers, so it is computed here and stamped on <html> as
 * `data-theme-family`. Get it wrong and a light custom ground gets the dark note fills: near-black
 * cards on a pale page.
 */
export function isDarkGround(ground: string): boolean {
  return HEX.test(ground) ? hexLuminance(ground) < DARK_GROUND_BELOW : true
}

/** The family attribute for a theme — the one thing index.css keys the note palette off. */
export function themeFamily(theme: ThemeId, custom: CustomColors): 'dark' | 'light' {
  if (theme === 'custom') {
    return isDarkGround(custom.ground) ? 'dark' : 'light'
  }
  return themeOption(theme).dark ? 'dark' : 'light'
}

/** A stored pair, or the funky default. Either colour being missing or malformed falls back on its
 *  own, so a half-written value costs one colour rather than the whole theme. */
export function readCustomColors(raw: string | null): CustomColors {
  let parsed: unknown = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  const source = (parsed ?? {}) as Partial<CustomColors>
  return {
    ground: HEX.test(source.ground ?? '') ? source.ground!.toLowerCase() : CUSTOM_DEFAULT.ground,
    accent: HEX.test(source.accent ?? '') ? source.accent!.toLowerCase() : CUSTOM_DEFAULT.accent,
  }
}

export function writeCustomColors(colors: CustomColors): string {
  return JSON.stringify(readCustomColors(JSON.stringify(colors)))
}

/**
 * A whole theme, from two colours.
 *
 * Two pickers, not fifteen. Every other surface is mixed from the ground and every accent state from
 * the accent, because a theme is a set of *relationships* — a border is "a bit away from the page",
 * type is "most of the way from it" — and handing those out as separate choices is not a theme
 * editor, it is a way to build an unreadable app one field at a time.
 *
 * Mixed by the browser rather than here. `color-mix` works in the same space the rest of this app
 * already tints spaces and card capsules in, and it means the values stay legible in the inspector
 * as "the accent, 18% into the page" instead of a hex nobody can trace back.
 *
 * `lift` is which way "away from the page" points. On a dark ground everything moves toward white
 * and on a light one toward near-black, which is the whole difference between the two families.
 */
export function customThemeVars(colors: CustomColors): Record<string, string> {
  const { ground, accent } = readCustomColors(JSON.stringify(colors))
  const lift = isDarkGround(ground) ? '#ffffff' : '#0d0b12'
  const from = (weight: number, base = ground) =>
    `color-mix(in srgb, ${lift} ${weight}%, ${base})`

  return {
    // The page is the colour that was picked; everything else steps away from it.
    '--surface-muted-base': ground,
    '--surface-base': from(7),
    '--surface-raised-base': from(13),
    '--border-base': from(24),
    '--hover-base': from(18),
    '--color-border-strong': from(40),
    '--color-text': from(92),
    '--color-text-muted': from(58),

    '--color-accent': accent,
    '--color-accent-hover': from(22, accent),
    // Behind accent-coloured text, so it is the accent brought most of the way back to the page —
    // not the accent lightened, which would leave the text sitting on itself.
    '--color-accent-soft': `color-mix(in srgb, ${accent} 18%, ${ground})`,
    '--color-accent-soft-hover': `color-mix(in srgb, ${accent} 27%, ${ground})`,
    '--color-accent-ink': from(45, accent),

    // Danger is not the reader's to choose — "this went wrong" has to read as wrong, and a hue
    // picked to go with somebody's accent would stop. What it does follow is the family, because a
    // red drawn for a near-black room is a pale pink on a white page: 2.3 against 4.5.
    '--color-danger': isDarkGround(ground) ? '#ff7a92' : '#b42318',
    '--color-danger-hover': isDarkGround(ground) ? '#ff9dae' : '#912018',
  }
}

/** The properties customThemeVars can set — what has to be cleared from <html> when the theme is
 *  anything else, so a stale custom ground cannot leak into Studio. */
export const CUSTOM_VAR_NAMES = Object.keys(customThemeVars(CUSTOM_DEFAULT))
