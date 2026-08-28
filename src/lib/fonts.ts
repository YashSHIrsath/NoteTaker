/**
 * The faces the app can be set in, and where each one is offered.
 *
 * Two choices, not one: the reading face (note bodies, labels, menus) and the heading face (card
 * titles, page headings, the Tree's numbers). They are genuinely separate decisions — a high-contrast
 * serif that makes a beautiful heading is unreadable at 11px, and the UI face that carries metadata
 * best has no personality at a display size. Which is why some entries below are offered for one role
 * and some for both.
 *
 * The wordmark is in neither list. It is set in --font-brand, which nothing here can reach: a logo
 * that changes with a preference is not a logo.
 *
 * ---------------------------------------------------------------- loading
 *
 * Only the two chosen faces are fetched. Twenty-odd families in the document's own <link> would be
 * most of a megabyte of webfont on every first paint, for twenty of which any given account has no
 * use — so Inter and Sansita ship in index.html as the defaults, and anything else is requested at
 * the moment somebody picks it. See useAppFonts.
 */

export type FontRole = 'body' | 'heading'

export interface FontOption {
  id: string
  label: string
  /** How it reads, in the words of somebody choosing. Not "a geometric sans with a tall x-height". */
  hint: string
  /** Which lists it appears in. */
  roles: FontRole[]
  /** The full CSS stack, fallbacks included. */
  stack: string
  /**
   * The `family=` fragment for the Google Fonts API, or null for a face already in the document.
   *
   * Weights are picked per role: a body face needs 400 through 700 for prose, labels and bold runs; a
   * display face is only ever used large and bold, so it asks for less.
   */
  google: string | null
}

const SANS_FALLBACK = '"Segoe UI", "Helvetica Neue", system-ui, sans-serif'
const SERIF_FALLBACK = '"Iowan Old Style", Georgia, "Times New Roman", serif'
const MONO_FALLBACK = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace'

export const FONT_OPTIONS: FontOption[] = [
  /* ------------------------------------------------------------------ the defaults */
  {
    id: 'inter',
    label: 'Inter',
    hint: 'The app’s own face. Proportional, tuned for interfaces, and the most words per line.',
    roles: ['body'],
    stack: `"Inter", ${SANS_FALLBACK}`,
    google: null,
  },
  {
    id: 'sansita',
    label: 'Sansita',
    hint: 'The app’s own headings. High contrast, tight apertures, made for display sizes.',
    roles: ['heading'],
    stack: `"Sansita", ${SERIF_FALLBACK}`,
    google: null,
  },

  /* ------------------------------------------------------------------ modern sans */
  {
    id: 'dm-sans',
    label: 'DM Sans',
    hint: 'Low-contrast geometric. Quiet, current, and never in the way of what it is setting.',
    roles: ['body', 'heading'],
    stack: `"DM Sans", ${SANS_FALLBACK}`,
    google: 'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    hint: 'Semi-condensed and confident. Reads expensive at a heading size and stays legible small.',
    roles: ['body', 'heading'],
    stack: `"Manrope", ${SANS_FALLBACK}`,
    google: 'Manrope:wght@400;500;600;700;800',
  },
  {
    id: 'plex-sans',
    label: 'IBM Plex Sans',
    hint: 'Engineered and slightly formal. Notes read like documentation, in the good sense.',
    roles: ['body'],
    stack: `"IBM Plex Sans", ${SANS_FALLBACK}`,
    google: 'IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    hint: 'Humanist and warm. Softer than Inter without giving up any clarity.',
    roles: ['body'],
    stack: `"Work Sans", ${SANS_FALLBACK}`,
    google: 'Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    hint: 'Perfectly circular geometry. Modern to the point of being architectural.',
    roles: ['body', 'heading'],
    stack: `"Outfit", ${SANS_FALLBACK}`,
    google: 'Outfit:wght@400;500;600;700;800',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    hint: 'Odd, technical, memorable. The most opinionated thing in this list.',
    roles: ['body', 'heading'],
    stack: `"Space Grotesk", ${SANS_FALLBACK}`,
    google: 'Space+Grotesk:wght@400;500;600;700',
  },
  {
    id: 'sora',
    label: 'Sora',
    hint: 'Squared-off and deliberate. Headings that look like a product, not a document.',
    roles: ['heading'],
    stack: `"Sora", ${SANS_FALLBACK}`,
    google: 'Sora:wght@400;500;600;700;800',
  },

  /* ------------------------------------------------------------------ serif */
  {
    id: 'source-serif',
    label: 'Source Serif 4',
    hint: 'A screen serif built for long reading. The closest this list gets to a printed page.',
    roles: ['body', 'heading'],
    stack: `"Source Serif 4", ${SERIF_FALLBACK}`,
    google: 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400',
  },
  {
    id: 'lora',
    label: 'Lora',
    hint: 'Brushed contrast, literary without being fussy. Good for notes you actually write in.',
    roles: ['body', 'heading'],
    stack: `"Lora", ${SERIF_FALLBACK}`,
    google: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    hint: 'Wobbly, old-style, unmistakably crafted. Expensive-looking at a heading size.',
    roles: ['heading'],
    stack: `"Fraunces", ${SERIF_FALLBACK}`,
    google: 'Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,700',
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    hint: 'High-contrast and editorial. A magazine masthead, if that is the register you want.',
    roles: ['heading'],
    stack: `"Playfair Display", ${SERIF_FALLBACK}`,
    google: 'Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,700',
  },
  {
    id: 'dm-serif',
    label: 'DM Serif Display',
    hint: 'Tight, glossy, sure of itself. Only ever a heading — it has no small sizes.',
    roles: ['heading'],
    stack: `"DM Serif Display", ${SERIF_FALLBACK}`,
    google: 'DM+Serif+Display:ital@0;1',
  },
  {
    id: 'instrument-serif',
    label: 'Instrument Serif',
    hint: 'Narrow and understated. Fits a long title in a short space without shouting.',
    roles: ['heading'],
    stack: `"Instrument Serif", ${SERIF_FALLBACK}`,
    google: 'Instrument+Serif:ital@0;1',
  },

  /* ------------------------------------------------------------------ mono */
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    hint: 'Every character the same width. Lists and numbers line up, and 1, l and I never look alike.',
    roles: ['body'],
    stack: `"JetBrains Mono", ${MONO_FALLBACK}`,
    google: 'JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'plex-mono',
    label: 'IBM Plex Mono',
    hint: 'A softer monospace with real serifs on the i and l. Warmer than JetBrains for prose.',
    roles: ['body'],
    stack: `"IBM Plex Mono", ${MONO_FALLBACK}`,
    google: 'IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },

  /* ------------------------------------------------------------------ accessibility */
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    hint: 'Drawn so that no two characters can be confused. The most legible face here, by design.',
    roles: ['body', 'heading'],
    stack: `"Atkinson Hyperlegible", ${SANS_FALLBACK}`,
    google: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400',
  },
]

const BY_ID = new Map(FONT_OPTIONS.map((option) => [option.id, option]))

export const DEFAULT_BODY_FONT = 'inter'
export const DEFAULT_HEADING_FONT = 'sansita'

export function fontsFor(role: FontRole): FontOption[] {
  return FONT_OPTIONS.filter((option) => option.roles.includes(role))
}

/** A face by id, or the default for that role. Never null: an id from a hand-edited preference or an
 *  older build must not leave the app with no face at all. */
export function fontFor(role: FontRole, id: string | undefined): FontOption {
  const option = id ? BY_ID.get(id) : undefined
  if (option && option.roles.includes(role)) {
    return option
  }
  return BY_ID.get(role === 'body' ? DEFAULT_BODY_FONT : DEFAULT_HEADING_FONT)!
}

const BODY_KEY = 'body_font'
const HEADING_KEY = 'heading_font'

/**
 * The stored ids.
 *
 * `body_font` is the same key the two-option version used, and 'mono' was its value for JetBrains —
 * so that is mapped rather than discarded. Somebody who chose a monospace before this list existed
 * keeps it.
 */
export function readFontChoice(
  role: FontRole,
  metadata: Record<string, unknown> | undefined,
): FontOption {
  const raw = metadata?.[role === 'body' ? BODY_KEY : HEADING_KEY]
  if (typeof raw !== 'string') {
    return fontFor(role, undefined)
  }
  if (role === 'body' && raw === 'mono') {
    return fontFor('body', 'jetbrains-mono')
  }
  if (role === 'body' && raw === 'sans') {
    return fontFor('body', DEFAULT_BODY_FONT)
  }
  return fontFor(role, raw)
}

export function fontUpdate(role: FontRole, id: string): Record<string, string> {
  return { [role === 'body' ? BODY_KEY : HEADING_KEY]: id }
}
