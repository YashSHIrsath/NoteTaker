import { useState } from 'react'
import { AlarmClock, Check, Sparkles } from 'lucide-react'
import { ensureFont, fontById, SIGNUP_FONT_DEFAULTS, type FontRole } from '../../lib/fonts'
import { cn } from '../../lib/cn'
import { Reveal } from './Reveal'

/**
 * The shortlist offered here, not the full catalogue.
 *
 * Settings' own picker — and the header's own shortcut, see Header.tsx — is the place for all
 * thirty-odd options across five groups, because somebody there has already decided to spend a
 * few minutes on it. A visitor scrolling a marketing page has not, and the point of this section
 * is the *idea* — a note is three faces, not one — not an exhaustive survey. A flat, ungrouped row
 * that fits without scrolling reads as an invitation to try a few; a scrollable shelf of thirty
 * options with category headers reads as the settings screen this is only meant to preview.
 *
 * Ids only, resolved through fontById — so a hint or a stack changes in exactly one place, the
 * catalogue itself, and never drifts between what Settings offers and what this teases.
 */
const PLAYGROUND_FONTS: Record<FontRole, string[]> = {
  body: ['inter', 'geist', 'manrope', 'atkinson', 'space-grotesk', 'jetbrains-mono'],
  heading: ['manrope', 'sansita', 'fraunces', 'playfair', 'sora', 'kalam'],
  note: ['kalam', 'caveat', 'shantell-sans', 'gloria-hallelujah', 'covered-by-your-grace', 'dancing-script'],
}

const ROLE_INFO: { role: FontRole; label: string; blurb: string }[] = [
  { role: 'body', label: 'Interface', blurb: 'Menus, labels, the metadata around a note.' },
  { role: 'heading', label: 'Headings', blurb: 'A note’s title, and every page heading in the app.' },
  { role: 'note', label: 'Notes', blurb: 'The words inside the note itself.' },
]

/** One selectable face, set in itself — so the chip previews what it offers before it is even
 *  chosen, rather than naming it and making you imagine the rest.
 *
 *  It renders in the browser's own fallback for that category until it is actually picked — see
 *  the note on `select` in FontPlayground for why fetching all six up front, let alone all thirty
 *  in the full catalogue, is worse than a flash of the fallback on the one somebody taps. */
function FontChip({
  id,
  active,
  onSelect,
}: {
  id: string
  active: boolean
  onSelect: () => void
}) {
  const option = fontById(id)
  if (!option) {
    return null
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      style={{ fontFamily: option.stack }}
      className={cn(
        'anim-press shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30',
        active
          ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-hover)]',
      )}
    >
      {option.label}
    </button>
  )
}

/**
 * One role's picker: what it is, in a sentence, and the row of faces to try it in.
 *
 * The sentence is not a caption underneath a control — it is half of what this section is for.
 * "Tell someone there are three faces" and "let them try each one" are the same job done twice if
 * they are two separate blocks; folding the explanation into the picker that proves it means
 * nobody has to read the claim and then go looking for where it applies.
 */
function RolePicker({
  role,
  label,
  blurb,
  selected,
  onSelect,
}: {
  role: FontRole
  label: string
  blurb: string
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <p className="text-[13.5px] font-bold tracking-tight text-[var(--color-text)]">{label}</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--color-text-muted)]">{blurb}</p>
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={`${label} face`}>
        {PLAYGROUND_FONTS[role].map((id) => (
          <FontChip key={id} id={id} active={selected === id} onSelect={() => onSelect(id)} />
        ))}
      </div>
    </div>
  )
}

/**
 * The illustration: a note card, exactly as the real app builds one — a metadata line in the
 * interface face, a title in the heading face, a paragraph and a checklist in the note face —
 * carrying whichever three the visitor has picked.
 *
 * Each of the three text blocks is keyed on its own font id, which is what makes the swap an
 * animation rather than a repaint: changing the key remounts the element, and anim-type-in plays
 * from its own opening frame every time. Three independent keys rather than one on the card,
 * because picking a new heading has no reason to also replay the paragraph underneath it.
 */
function PreviewCard({
  bodyId,
  headingId,
  noteId,
}: {
  bodyId: string
  headingId: string
  noteId: string
}) {
  const body = fontById(bodyId)
  const heading = fontById(headingId)
  const note = fontById(noteId)
  if (!body || !heading || !note) {
    return null
  }
  return (
    <div
      aria-hidden
      className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 shadow-[var(--shadow-lg)] sm:p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          key={bodyId}
          className="anim-type-in inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent-ink)]"
          style={{ fontFamily: body.stack }}
        >
          <AlarmClock className="h-3 w-3" aria-hidden />
          Due Friday · 1 of 3 done
        </span>
        <span
          key={`badge-${bodyId}`}
          className="anim-type-in shrink-0 text-[11px] text-[var(--color-text-muted)]"
          style={{ fontFamily: body.stack }}
        >
          in Job hunt
        </span>
      </div>

      <h3
        key={headingId}
        className="anim-type-in mt-4 text-[24px] font-extrabold leading-[1.1] tracking-tight text-[var(--color-text)] sm:text-[28px]"
        style={{ fontFamily: heading.stack }}
      >
        Interview prep
      </h3>

      <p
        key={noteId}
        className="anim-type-in mt-3 text-[15.5px] leading-relaxed text-[var(--color-text)] sm:text-[16.5px]"
        style={{ fontFamily: note.stack }}
      >
        Three questions to have ready before Friday, and the sync design to walk through.
      </p>

      <div
        key={`checklist-${noteId}`}
        className="anim-type-in mt-3.5 space-y-1.5 border-t border-[var(--color-border)] pt-3.5"
        style={{ fontFamily: note.stack }}
      >
        {[
          { text: 'Two things I shipped this quarter', done: true },
          { text: 'One question about the team', done: false },
        ].map((item) => (
          <p key={item.text} className="flex items-start gap-2 text-[14.5px] text-[var(--color-text)]">
            <span
              className={cn(
                'mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
                item.done
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                  : 'border-[var(--color-border-strong)]',
              )}
            >
              {item.done ? <Check className="h-2.5 w-2.5" /> : null}
            </span>
            <span className={item.done ? 'text-[var(--color-text-muted)] line-through' : undefined}>
              {item.text}
            </span>
          </p>
        ))}
      </div>
    </div>
  )
}

/**
 * "Every note here is set in three faces, not one" — said once, then proven by letting a visitor
 * change all three themselves and watch the card answer back.
 *
 * The starting selection is SIGNUP_FONT_DEFAULTS, not this file's own opinion of a good demo —
 * what a visitor tries first is exactly what their account will actually open in on day one, so
 * there is nothing to unlearn between playing here and signing up. Picking is free of consequence:
 * nothing here is saved, there is no account yet to save it to, and every real choice waits behind
 * the same three-tab picker in Settings — or the header's own shortcut, once there is an account
 * signed in — once there is one.
 */
export function FontPlayground() {
  const [bodyId, setBodyId] = useState(SIGNUP_FONT_DEFAULTS.body)
  const [headingId, setHeadingId] = useState(SIGNUP_FONT_DEFAULTS.heading)
  const [noteId, setNoteId] = useState(SIGNUP_FONT_DEFAULTS.note)

  /**
   * A face is fetched the moment it is picked, never before.
   *
   * Fetching all six per role up front — eighteen requests, several of them for the same face
   * repeated across roles — for a visitor who taps at most three chips is bandwidth spent on
   * options nobody asked for. Settings' own picker makes the identical trade for its full
   * catalogue: an unpicked tile renders in the browser's fallback for that category until chosen.
   * `display=swap` on the stylesheet URL is what keeps the pick itself from looking broken while
   * its request is still in flight — one flash of the fallback, then the real face settles in.
   */
  const select = (setter: (id: string) => void) => (id: string) => {
    const option = fontById(id)
    if (option) {
      ensureFont(option)
    }
    setter(id)
  }

  return (
    <section id="type" className="border-t border-[var(--color-border)] py-14 sm:py-20">
      <Reveal from="blur" className="max-w-2xl">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
          <Sparkles className="h-3 w-3" aria-hidden />
          Type
        </p>
        <h2
          className="mt-4 text-[26px] font-extrabold leading-[1.08] tracking-tight [text-wrap:balance] sm:text-[36px] lg:text-[40px]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Three faces, not one
        </h2>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          A note here is never set in a single font. The chrome around it, its title, and what you
          actually write are three separate choices — try each below and watch the card on the
          right answer back.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12">
        <Reveal from="left" delay={80} className="space-y-6">
          {ROLE_INFO.map(({ role, label, blurb }) => (
            <RolePicker
              key={role}
              role={role}
              label={label}
              blurb={blurb}
              selected={role === 'body' ? bodyId : role === 'heading' ? headingId : noteId}
              onSelect={select(role === 'body' ? setBodyId : role === 'heading' ? setHeadingId : setNoteId)}
            />
          ))}
        </Reveal>

        <Reveal from="right" delay={140}>
          <PreviewCard bodyId={bodyId} headingId={headingId} noteId={noteId} />
        </Reveal>
      </div>
    </section>
  )
}
