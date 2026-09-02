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

/**
 * The three things a face can be set as.
 *
 * `body` is the interface — labels, menus, metadata, every 11px line in the app. `heading` is card
 * titles and page headings. `note` is the text *inside* a note, and it is separate from `body` for
 * the reason the other two are separate from each other: the register you want to write in is not
 * the register you want the chrome around it in. Somebody keeping the UI in Inter and their notes in
 * a felt-tip hand is the ordinary case, not an exotic one.
 *
 * A note face also gets more room than a body face — note text is set at 16px, UI metadata at 11px —
 * so several hands that are unreadable in a menu are perfectly comfortable in a paragraph, and are
 * offered for `note` but not for `body`.
 */
export type FontRole = 'body' | 'heading' | 'note'

/**
 * What kind of face it is, for grouping the picker.
 *
 * Twenty-nine tiles in one flat grid is a wall — and worse, it hides the actual decision, which is
 * almost always "I want a handwritten one" or "I want a plain one" before it is ever about a
 * particular name. The groups make that first choice visible.
 */
export type FontGroup = 'sans' | 'serif' | 'handwriting' | 'mono' | 'accessible'

/** The order the groups are offered in, and what each is called on screen. */
export const FONT_GROUPS: { id: FontGroup; label: string; blurb: string }[] = [
  { id: 'sans', label: 'Sans-serif', blurb: 'Plain and modern. The safe, legible default.' },
  { id: 'serif', label: 'Serif', blurb: 'Printed and literary. Reads like a page.' },
  { id: 'handwriting', label: 'Handwriting', blurb: 'Pen, pencil and marker. Notes that look written.' },
  { id: 'mono', label: 'Monospace', blurb: 'Every character the same width. Lists and numbers line up.' },
  { id: 'accessible', label: 'Built for legibility', blurb: 'Drawn so no two characters can be confused.' },
]

export interface FontOption {
  id: string
  label: string
  /** How it reads, in the words of somebody choosing. Not "a geometric sans with a tall x-height". */
  hint: string
  /** Which lists it appears in. */
  roles: FontRole[]
  /** Which section of the picker it sits in. */
  group: FontGroup
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
/**
 * Behind a handwriting face, two faces that are actually installed somewhere.
 *
 * `cursive` alone would satisfy the "always resolves" rule and land on something wildly different
 * per platform — Snell Roundhand on a Mac is a formal copperplate script, which is not what any of
 * these are. Bradley Hand (macOS/iOS) and Segoe Print (Windows) are the closest real hands, and
 * Comic Sans is on both; only after all three does it give up and take whatever `cursive` means.
 */
const HAND_FALLBACK = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive'

export const FONT_OPTIONS: FontOption[] = [
  /* ------------------------------------------------------------------ the defaults */
  {
    id: 'inter',
    label: 'Inter',
    hint: 'The app’s own face. Proportional, tuned for interfaces, and the most words per line.',
    roles: ['body', 'note'],
    group: 'sans',
    stack: `"Inter", ${SANS_FALLBACK}`,
    google: null,
  },
  {
    id: 'sansita',
    label: 'Sansita',
    hint: 'The app’s own headings. High contrast, tight apertures, made for display sizes.',
    roles: ['heading'],
    group: 'serif',
    stack: `"Sansita", ${SERIF_FALLBACK}`,
    google: null,
  },

  /* ------------------------------------------------------------------ modern sans */
  {
    id: 'geist',
    label: 'Geist',
    hint: 'Plain, close-set and precise. Neutral enough to disappear at 11px and still hold a title.',
    roles: ['body', 'heading', 'note'],
    group: 'sans',
    stack: `"Geist", ${SANS_FALLBACK}`,
    // 800 as well as the body weights, because this one is offered for both roles and a heading is
    // only ever set heavy. The italic is a real one, not a synthesised slant — checked, because a
    // body face without one leaves every emphasised run in a note to the browser's oblique.
    google: 'Geist:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    hint: 'Low-contrast geometric. Quiet, current, and never in the way of what it is setting.',
    roles: ['body', 'heading', 'note'],
    group: 'sans',
    stack: `"DM Sans", ${SANS_FALLBACK}`,
    google: 'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    hint: 'Semi-condensed and confident. Reads expensive at a heading size and stays legible small.',
    roles: ['body', 'heading', 'note'],
    group: 'sans',
    stack: `"Manrope", ${SANS_FALLBACK}`,
    google: 'Manrope:wght@400;500;600;700;800',
  },
  {
    id: 'plex-sans',
    label: 'IBM Plex Sans',
    hint: 'Engineered and slightly formal. Notes read like documentation, in the good sense.',
    roles: ['body', 'note'],
    group: 'sans',
    stack: `"IBM Plex Sans", ${SANS_FALLBACK}`,
    google: 'IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    hint: 'Humanist and warm. Softer than Inter without giving up any clarity.',
    roles: ['body', 'note'],
    group: 'sans',
    stack: `"Work Sans", ${SANS_FALLBACK}`,
    google: 'Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    hint: 'Perfectly circular geometry. Modern to the point of being architectural.',
    roles: ['body', 'heading', 'note'],
    group: 'sans',
    stack: `"Outfit", ${SANS_FALLBACK}`,
    google: 'Outfit:wght@400;500;600;700;800',
  },
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    hint: 'Odd, technical, memorable. The most opinionated thing in this list.',
    roles: ['body', 'heading', 'note'],
    group: 'sans',
    stack: `"Space Grotesk", ${SANS_FALLBACK}`,
    google: 'Space+Grotesk:wght@400;500;600;700',
  },
  {
    id: 'sora',
    label: 'Sora',
    hint: 'Squared-off and deliberate. Headings that look like a product, not a document.',
    roles: ['heading'],
    group: 'sans',
    stack: `"Sora", ${SANS_FALLBACK}`,
    google: 'Sora:wght@400;500;600;700;800',
  },

  /* ------------------------------------------------------------------ serif */
  {
    id: 'source-serif',
    label: 'Source Serif 4',
    hint: 'A screen serif built for long reading. The closest this list gets to a printed page.',
    roles: ['body', 'heading', 'note'],
    group: 'serif',
    stack: `"Source Serif 4", ${SERIF_FALLBACK}`,
    google: 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400',
  },
  {
    id: 'lora',
    label: 'Lora',
    hint: 'Brushed contrast, literary without being fussy. Good for notes you actually write in.',
    roles: ['body', 'heading', 'note'],
    group: 'serif',
    stack: `"Lora", ${SERIF_FALLBACK}`,
    google: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    hint: 'Wobbly, old-style, unmistakably crafted. Expensive-looking at a heading size.',
    roles: ['heading'],
    group: 'serif',
    stack: `"Fraunces", ${SERIF_FALLBACK}`,
    google: 'Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,700',
  },
  {
    id: 'playfair',
    label: 'Playfair Display',
    hint: 'High-contrast and editorial. A magazine masthead, if that is the register you want.',
    roles: ['heading'],
    group: 'serif',
    stack: `"Playfair Display", ${SERIF_FALLBACK}`,
    google: 'Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,700',
  },
  {
    id: 'dm-serif',
    label: 'DM Serif Display',
    hint: 'Tight, glossy, sure of itself. Only ever a heading — it has no small sizes.',
    roles: ['heading'],
    group: 'serif',
    stack: `"DM Serif Display", ${SERIF_FALLBACK}`,
    google: 'DM+Serif+Display:ital@0;1',
  },
  {
    id: 'instrument-serif',
    label: 'Instrument Serif',
    hint: 'Narrow and understated. Fits a long title in a short space without shouting.',
    roles: ['heading'],
    group: 'serif',
    stack: `"Instrument Serif", ${SERIF_FALLBACK}`,
    google: 'Instrument+Serif:ital@0;1',
  },

  /* ------------------------------------------------------------------ mono */
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    hint: 'Every character the same width. Lists and numbers line up, and 1, l and I never look alike.',
    roles: ['body', 'note'],
    group: 'mono',
    stack: `"JetBrains Mono", ${MONO_FALLBACK}`,
    google: 'JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'plex-mono',
    label: 'IBM Plex Mono',
    hint: 'A softer monospace with real serifs on the i and l. Warmer than JetBrains for prose.',
    roles: ['body', 'note'],
    group: 'mono',
    stack: `"IBM Plex Mono", ${MONO_FALLBACK}`,
    google: 'IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },

  /* ------------------------------------------------------------------ handwriting
   *
   * A note-taking app is the one place these belong, and the reason they are worth having is the
   * reason they need care: they carry a register nothing else in this list can, and most of them are
   * drawn at exactly one weight.
   *
   * That last part matters more than it sounds. Every heading in this app is set at 700 or 800, so a
   * face that only ships 400 is *synthesised* bold by the browser — the outline smeared sideways.
   * On a chunky felt-tip that passes; on a thin pencil hand it turns to mud. Which is why Kalam and
   * Caveat, the two with real bold cuts, are the ones offered without reservation, and why the two
   * faintest hands are offered as headings only: at 11px, in a menu, they stop being legible before
   * they stop being pretty.
   */
  {
    id: 'kalam',
    label: 'Kalam',
    hint: 'A felt-tip hand with real weight behind it. The most readable of these by some distance.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Kalam", ${HAND_FALLBACK}`,
    /* Null, like Inter and Sansita, because this is a default now and ships in index.html — a
       default face fetched at runtime is a first paint in Comic Sans. It is also one of only two
       hands here with a drawn bold, which is half of why it got the job: every heading in this app
       is set at 700 or 800, and the alternative was a smeared 400. The other half is its x-height,
       which is what lets one face carry a 72px landing headline and a 14.5px card title. */
    google: null,
  },
  {
    id: 'caveat',
    label: 'Caveat',
    hint: 'A quick marker-pen scrawl. Casual and slanted, and still easy to read at speed.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Caveat", ${HAND_FALLBACK}`,
    // Ships in index.html: the welcome page sets its text in this, so it cannot arrive late.
    google: null,
  },
  {
    id: 'patrick-hand',
    label: 'Patrick Hand',
    hint: 'Neat, upright ballpoint. Like a note left on the kitchen table.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Patrick Hand", ${HAND_FALLBACK}`,
    google: 'Patrick+Hand',
  },
  {
    id: 'handlee',
    label: 'Handlee',
    hint: 'An unhurried rounded hand. Friendly without tipping over into cute.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Handlee", ${HAND_FALLBACK}`,
    google: 'Handlee',
  },
  {
    id: 'architects-daughter',
    label: 'Architects Daughter',
    hint: 'Wide, deliberate draughtsman’s printing. Every letter looks drawn on purpose.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Architects Daughter", ${HAND_FALLBACK}`,
    google: 'Architects+Daughter',
  },
  {
    id: 'indie-flower',
    label: 'Indie Flower',
    hint: 'Round, bubbly and cheerful. The most informal thing in this list.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Indie Flower", ${HAND_FALLBACK}`,
    google: 'Indie+Flower',
  },
  {
    id: 'shadows-into-light',
    label: 'Shadows Into Light',
    hint: 'Thin, airy pencil. Lovely at a title size; too faint for small print.',
    // Heading only, and that is the whole judgement: its strokes are a hairline, and a hairline set
    // at 11px in a menu is a face you squint at.
    roles: ['heading', 'note'],
    group: 'handwriting',
    stack: `"Shadows Into Light", ${HAND_FALLBACK}`,
    google: 'Shadows+Into+Light',
  },
  {
    id: 'nothing-you-could-do',
    label: 'Nothing You Could Do',
    hint: 'A hurried, steeply slanted scribble. Charming as a title, hard work as a paragraph.',
    roles: ['heading', 'note'],
    group: 'handwriting',
    stack: `"Nothing You Could Do", ${HAND_FALLBACK}`,
    google: 'Nothing+You+Could+Do',
  },

  {
    id: 'shantell-sans',
    label: 'Shantell Sans',
    hint: 'A drawn hand with a full range of weights. The one here that works everywhere, including a menu.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Shantell Sans", ${HAND_FALLBACK}`,
    /* The exception to everything the section note says about synthesised bold: this is a genuine
       variable face, 300 to 800, with a real italic. It is why it is offered for the interface as
       well — a handwriting face that holds up at 11px is a rare thing. */
    // Ships in index.html: the welcome page sets its text in this, so it cannot arrive late.
    google: null,
  },
  {
    id: 'gloria-hallelujah',
    label: 'Gloria Hallelujah',
    hint: 'The archetypal friendly note. Loose, rounded, and the easiest of these to read at speed.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Gloria Hallelujah", ${HAND_FALLBACK}`,
    google: 'Gloria+Hallelujah',
  },
  {
    id: 'covered-by-your-grace',
    label: 'Covered By Your Grace',
    hint: 'Neat slanted note-taking, the way somebody writes when they mean to read it back.',
    roles: ['body', 'heading', 'note'],
    group: 'handwriting',
    stack: `"Covered By Your Grace", ${HAND_FALLBACK}`,
    google: 'Covered+By+Your+Grace',
  },
  {
    id: 'dancing-script',
    label: 'Dancing Script',
    hint: 'Joined-up cursive with real bold cuts. Elegant without being a wedding invitation.',
    roles: ['heading', 'note'],
    group: 'handwriting',
    stack: `"Dancing Script", ${HAND_FALLBACK}`,
    google: 'Dancing+Script:wght@400;500;600;700',
  },
  {
    id: 'amatic-sc',
    label: 'Amatic SC',
    hint: 'Tall, narrow capitals. Fits a long title in a short space and looks hand-lettered doing it.',
    roles: ['heading', 'note'],
    group: 'handwriting',
    stack: `"Amatic SC", ${HAND_FALLBACK}`,
    google: 'Amatic+SC:wght@400;700',
  },
  {
    id: 'just-another-hand',
    label: 'Just Another Hand',
    hint: 'Very tall and very condensed. A note scribbled in the margin, and the narrowest face here.',
    roles: ['heading', 'note'],
    group: 'handwriting',
    stack: `"Just Another Hand", ${HAND_FALLBACK}`,
    google: 'Just+Another+Hand',
  },
  {
    id: 'reenie-beanie',
    label: 'Reenie Beanie',
    hint: 'A loose ballpoint scrawl. Casual to the point of being scruffy, in the good way.',
    roles: ['heading', 'note'],
    group: 'handwriting',
    stack: `"Reenie Beanie", ${HAND_FALLBACK}`,
    google: 'Reenie+Beanie',
  },
  {
    id: 'sacramento',
    label: 'Sacramento',
    hint: 'A fine single-stroke script. The most refined thing in this list, and the most delicate.',
    roles: ['heading', 'note'],
    group: 'handwriting',
    stack: `"Sacramento", ${HAND_FALLBACK}`,
    google: 'Sacramento',
  },
  {
    id: 'permanent-marker',
    label: 'Permanent Marker',
    hint: 'Thick, opaque marker pen. The only one of these with any weight to shout with.',
    // Heading only: it is drawn at one very heavy weight, and a paragraph of it is a paragraph of
    // shouting. As a title it is the best thing here.
    roles: ['heading'],
    group: 'handwriting',
    stack: `"Permanent Marker", ${HAND_FALLBACK}`,
    google: 'Permanent+Marker',
  },
  {
    id: 'homemade-apple',
    label: 'Homemade Apple',
    hint: 'Real joined-up pen cursive. Lovely on a title; genuinely slow to read in quantity.',
    roles: ['heading'],
    group: 'handwriting',
    stack: `"Homemade Apple", ${HAND_FALLBACK}`,
    google: 'Homemade+Apple',
  },

  /* ------------------------------------------------------------------ accessibility */
  {
    id: 'atkinson',
    label: 'Atkinson Hyperlegible',
    hint: 'Drawn so that no two characters can be confused. The most legible face here, by design.',
    roles: ['body', 'heading', 'note'],
    group: 'accessible',
    stack: `"Atkinson Hyperlegible", ${SANS_FALLBACK}`,
    google: 'Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400',
  },
]

const BY_ID = new Map(FONT_OPTIONS.map((option) => [option.id, option]))

/*
 * What a brand-new account is set in, before anybody chooses anything.
 *
 * Two of the three are handwritten, and the split is deliberate rather than timid. Headings and note
 * text are where a hand *is* the product — a note-taking app whose notes are handwritten says what
 * it is without a word of onboarding. The interface is not: `body` sets 11px menu labels and
 * metadata lines, and no hand is comfortable there. So the app reads as handwritten and stays as
 * legible as it was.
 *
 * Every one of these is a starting point, not a fixture — all three are changeable from Settings,
 * and a stored choice always wins.
 */
export const DEFAULT_BODY_FONT = 'inter'
export const DEFAULT_HEADING_FONT = 'kalam'
export const DEFAULT_NOTE_FONT = 'kalam'

export function fontsFor(role: FontRole): FontOption[] {
  return FONT_OPTIONS.filter((option) => option.roles.includes(role))
}

/** The same list, split into the sections the picker draws. Empty groups are dropped, so a role that
 *  has no monospace face simply has no monospace heading. */
export function groupedFontsFor(
  role: FontRole,
): { id: FontGroup; label: string; blurb: string; options: FontOption[] }[] {
  const available = fontsFor(role)
  return FONT_GROUPS.map((group) => ({
    ...group,
    options: available.filter((option) => option.group === group.id),
  })).filter((group) => group.options.length > 0)
}

/** A face by id, or the default for that role. Never null: an id from a hand-edited preference or an
 *  older build must not leave the app with no face at all. */
export function fontFor(role: FontRole, id: string | undefined): FontOption {
  const option = id ? BY_ID.get(id) : undefined
  if (option && option.roles.includes(role)) {
    return option
  }
  return BY_ID.get(DEFAULTS[role])!
}

const DEFAULTS: Record<FontRole, string> = {
  body: DEFAULT_BODY_FONT,
  heading: DEFAULT_HEADING_FONT,
  note: DEFAULT_NOTE_FONT,
}

const BODY_KEY = 'body_font'
const HEADING_KEY = 'heading_font'
const NOTE_KEY = 'note_font'

const KEYS: Record<FontRole, string> = {
  body: BODY_KEY,
  heading: HEADING_KEY,
  note: NOTE_KEY,
}

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
  const raw = metadata?.[KEYS[role]]

  /*
   * The note face, in three steps.
   *
   *   1. What you chose for notes, if you chose one.
   *   2. Otherwise the interface face — but only if you actually *picked* one. Somebody who sets the
   *      app to Lora means their notes too, and should not have to find a second setting to finish
   *      the job. Safe because every face offered for `body` is also offered for `note` (checked in
   *      fontChecks), so that choice always resolves here.
   *   3. Otherwise the handwriting default. This is the out-of-the-box state, and it is why step 2
   *      tests for a stored value rather than reading the resolved interface face: resolving it
   *      would hand back Inter — the interface *default* — and quietly beat the hand this step
   *      exists to apply.
   */
  if (role === 'note') {
    if (typeof raw === 'string') {
      const chosen = BY_ID.get(raw)
      if (chosen?.roles.includes('note')) {
        return chosen
      }
    }
    if (typeof metadata?.[BODY_KEY] === 'string') {
      const body = readFontChoice('body', metadata)
      if (body.roles.includes('note')) {
        return body
      }
    }
    return fontFor('note', DEFAULT_NOTE_FONT)
  }

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
  return { [KEYS[role]]: id }
}
