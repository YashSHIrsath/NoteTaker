import { Check } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { CUSTOM_DEFAULT, THEMES, type ThemeFamily, type ThemeOption } from '../../lib/themes'
import { originFromElement } from '../../lib/themeReveal'
import { cn } from '../../lib/cn'

/**
 * Every theme the app has, and which of them the header offers.
 *
 * Two questions on one screen, and keeping them apart is most of the work here. Picking a theme
 * happens now and is visible immediately — the whole page changes under the tap. Checking one is a
 * standing instruction about a control somewhere else. So the row is the picker, and the checkbox is
 * a separate, labelled thing at the end of it; the two are never the same gesture.
 *
 * Grouped by where a theme came from. Light and dark are the reader's own answer, and one of them was
 * chosen by their operating system before they arrived. The other three are the app's answer — see
 * lib/themes.ts — and they are grouped under their own heading so that distinction is on screen
 * rather than implied by the order.
 */

const FAMILIES: Array<{ id: ThemeFamily; title: string; blurb: string }> = [
  {
    id: 'system',
    title: 'Yours',
    blurb: 'The two the app started with. One of them is whatever your device already prefers.',
  },
  {
    id: 'signature',
    title: 'Mindstack’s own',
    blurb:
      'Rooms drawn for this app rather than defaults. Your notes keep their colours in all of them — these change what the notes sit on.',
  },
]

/**
 * The two colours the custom theme is built from.
 *
 * Two, not fifteen. Every surface is mixed from the page and every accent state from the accent (see
 * customThemeVars), because handing out a border colour and a hover colour as separate choices is
 * not a theme editor — it is a way to build an unreadable app one field at a time.
 *
 * A real `<input type="color">`, which opens the platform's own picker with its eyedropper and
 * commits as you drag — so the whole app repaints under the picker while you move. Same control the
 * note colour uses, for the same reason.
 */
function CustomColorPickers() {
  const { customColors, setCustomColors } = useTheme()
  const fields = [
    { key: 'ground' as const, label: 'Page', hint: 'Everything else is mixed from this.' },
    { key: 'accent' as const, label: 'Accent', hint: 'Buttons, links, the state of things.' },
  ]
  const pristine =
    customColors.ground === CUSTOM_DEFAULT.ground && customColors.accent === CUSTOM_DEFAULT.accent

  return (
    <div className="mt-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--color-text-muted)]">
          Your colours
        </p>
        {/* Only offered once there is something to undo. */}
        {pristine ? null : (
          <button
            type="button"
            onClick={() => setCustomColors(CUSTOM_DEFAULT)}
            className="anim-press rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-hover)]"
          >
            Reset
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {fields.map((field) => (
          <label
            key={field.key}
            className="anim-press relative flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 hover:bg-[var(--color-hover)]"
          >
            <span
              className="h-7 w-7 shrink-0 rounded-lg border border-black/15 dark:border-white/25"
              style={{ background: customColors[field.key] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-[var(--color-text)]">
                {field.label}
              </span>
              <span className="block text-[11px] leading-snug text-[var(--color-text-muted)]">
                {field.hint}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[11px] uppercase text-[var(--color-text-muted)]">
              {customColors[field.key]}
            </span>
            <input
              type="color"
              aria-label={field.label}
              value={customColors[field.key]}
              onChange={(event) =>
                setCustomColors({ ...customColors, [field.key]: event.target.value })
              }
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        A dark page gets pale type and the dark note colours; a light one gets the opposite. The
        switch happens on its own, from the page colour you pick.
      </p>
    </div>
  )
}

/**
 * A theme as the app in miniature: its page, a card on it, and its accent.
 *
 * The point of showing three surfaces rather than one swatch is that a theme *is* the relationship
 * between them. Studio and Indigo have near-identical grounds and are told apart by what happens on
 * top; a single chip would have shown two identical black squares.
 */
function Preview({ theme }: { theme: ThemeOption }) {
  const { ground, ink, accent } = theme.swatch
  return (
    <span
      className="relative block h-12 w-16 shrink-0 overflow-hidden rounded-lg"
      style={{
        background: ground,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ink} 22%, transparent)`,
      }}
      aria-hidden
    >
      {/* The card, and two lines of type on it, at the proportions a note actually has. */}
      <span
        className="absolute left-1.5 right-1.5 top-2 block rounded-[3px]"
        style={{ background: `color-mix(in srgb, ${ink} 8%, ${ground})`, height: '22px' }}
      >
        <span
          className="absolute left-1 right-3 top-1 block h-[3px] rounded-full"
          style={{ background: `color-mix(in srgb, ${ink} 74%, transparent)` }}
        />
        <span
          className="absolute left-1 right-1.5 top-[9px] block h-[2px] rounded-full"
          style={{ background: `color-mix(in srgb, ${ink} 34%, transparent)` }}
        />
        <span
          className="absolute left-1 right-5 top-[14px] block h-[2px] rounded-full"
          style={{ background: `color-mix(in srgb, ${ink} 34%, transparent)` }}
        />
      </span>
      {/* The accent, as the app spends it: one filled pill. */}
      <span
        className="absolute bottom-1.5 left-1.5 block h-2 w-5 rounded-full"
        style={{ background: accent }}
      />
      <span
        className="absolute bottom-1.5 right-1.5 block h-2 w-2 rounded-full"
        style={{ background: `color-mix(in srgb, ${ink} 26%, transparent)` }}
      />
    </span>
  )
}

export function ThemeSettings() {
  const { theme, setTheme, quickThemeIds, setQuickThemeIds, customColors } = useTheme()

  const toggleQuick = (id: ThemeOption['id']) => {
    setQuickThemeIds(
      quickThemeIds.includes(id)
        ? quickThemeIds.filter((entry) => entry !== id)
        : [...quickThemeIds, id],
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {FAMILIES.map((family) => (
        <div key={family.id}>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            {family.title}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            {family.blurb}
          </p>

          <div className="mt-2.5 flex flex-col gap-1.5">
            {THEMES.filter((option) => option.family === family.id).map((option) => {
              const active = option.id === theme
              const quick = quickThemeIds.includes(option.id)
              return (
                <div
                  key={option.id}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border p-2 transition-colors',
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-hover)]',
                  )}
                >
                  {/* The row itself picks the theme. A button rather than a radio: it is an action
                    * with an immediate, whole-page effect, not a value being staged for a save. */}
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={(event) => setTheme(option.id, originFromElement(event.currentTarget))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Preview
                      theme={
                        option.editable
                          ? {
                              ...option,
                              swatch: {
                                ...option.swatch,
                                ground: customColors.ground,
                                accent: customColors.accent,
                              },
                            }
                          : option
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'truncate text-[13.5px] font-semibold',
                            active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]',
                          )}
                        >
                          {option.label}
                        </span>
                        {active ? (
                          <Check
                            className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]"
                            aria-hidden
                          />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--color-text-muted)]">
                        {option.hint}
                      </span>
                    </span>
                  </button>

                  {/* And this is the other question entirely: whether it shows up in the corner.
                    * Labelled every time rather than once above the list, because a bare checkbox at
                    * the end of a row inherits the row's meaning, and the row means "use this". */}
                  <label
                    className={cn(
                      'flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-xl px-1.5 py-1',
                      'text-[9.5px] font-semibold uppercase tracking-[0.06em] transition-colors',
                      quick ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]',
                      'hover:bg-[var(--color-hover)]',
                    )}
                    title={
                      quick
                        ? `${option.label} is listed when you hover the theme button`
                        : `${option.label} is only available here`
                    }
                  >
                    <input
                      type="checkbox"
                      checked={quick}
                      onChange={() => toggleQuick(option.id)}
                      className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
                    />
                    <span>In header</span>
                  </label>
                </div>
              )
            })}

            {/* The pickers belong to the custom row and appear under it, once it is the theme you
              * are actually in. Offering them while another theme is on screen would be two colour
              * inputs that change nothing you can see — the whole point of editing a theme is
              * watching the app do it. */}
            {family.id === 'signature' && theme === 'custom' ? <CustomColorPickers /> : null}
          </div>
        </div>
      ))}

      <p className="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
        Unchecked themes stay right here — the tick only decides which ones the theme button in the
        top-right corner lists when you hover it. Whichever theme is in force always appears there,
        so you can always see and leave it.
      </p>
    </div>
  )
}
