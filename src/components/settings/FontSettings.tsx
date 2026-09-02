import { useState } from 'react'
import { Check, Type } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { groupedFontsFor, readFontChoice, type FontOption, type FontRole } from '../../lib/fonts'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { PickerDialog } from '../ui/PickerDialog'
import { cn } from '../../lib/cn'

/**
 * A sample of what the app will look like in one face.
 *
 * Deliberately not an alphabet or a pangram. What anybody actually wants to know is whether their
 * *notes* read well in it, so this is a note — a title, a line of prose, a metadata line at the size
 * the app really uses for one, and a row of the characters a proportional face confuses.
 *
 * Only the half being chosen changes. Previewing a heading face over sample body text set in the same
 * face would show a screen the app will never render, and the honest comparison is against the other
 * half as it currently stands.
 */
function Sample({ stacks }: { stacks: Record<FontRole, string> }) {
  return (
    <span className="block" style={{ fontFamily: stacks.body }}>
      <span
        className="block text-[15.5px] font-extrabold tracking-tight text-[var(--color-text)]"
        style={{ fontFamily: stacks.heading }}
      >
        Interview prep
      </span>
      {/* The one line that is actually note *content*, so it carries the note face rather than the
        * interface one — which is the whole distinction this sample now has to be able to show. */}
      <span
        className="mt-1 block text-[12.5px] leading-relaxed text-[var(--color-text)]"
        style={{ fontFamily: stacks.note }}
      >
        Three questions to have ready before Friday, and the sync design to walk through.
      </span>
      <span className="mt-1.5 block text-[11px] text-[var(--color-text-muted)]">
        Notes → Job hunt · 2 days left · 1 of 3 done
      </span>
      <span className="mt-1.5 block text-[12px] tabular-nums text-[var(--color-text-muted)]">
        0123456789 · Illegal1 O0 rn
      </span>
    </span>
  )
}

function FontChoices({
  role,
  title,
  blurb,
}: {
  role: FontRole
  title: string
  blurb: string
}) {
  const { user, updateProfile } = useAuth()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const current = readFontChoice(role, metadata)
  /* Every role as it currently stands. Each tile then swaps in just the one being previewed, so the
     sample is always this account's real screen with a single face changed — never a mock-up of a
     combination the app would not render. */
  const inForce: Record<FontRole, string> = {
    body: readFontChoice('body', metadata).stack,
    heading: readFontChoice('heading', metadata).stack,
    note: readFontChoice('note', metadata).stack,
  }
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = (option: FontOption) => {
    if (option.id === current.id || saving) {
      return
    }
    setSaving(option.id)
    setError(null)
    void updateProfile({ font: { role, id: option.id } })
      .catch((cause: unknown) => {
        // The real message. Supabase rate-limits account updates, which a few quick taps will hit,
        // and "check your connection" was wrong every time that was the cause.
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : 'Could not save that. Please try again.',
        )
      })
      .finally(() => setSaving(null))
  }

  return (
    <div>
      {/* The tab above already names the list, so this is the one-line explanation of what the choice
        * reaches rather than a second heading saying the same word. */}
      <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
        <span className="sr-only">{title}. </span>
        {blurb}
      </p>

      {/*
        * Grouped, because the first decision is almost never a name.
        *
        * Thirty-odd tiles in one flat grid is a wall, and it buries the question people actually
        * arrive with — "is there a handwritten one?" — under an alphabet of families they have no
        * opinion about. The headings answer that before any tile is read.
        *
        * Three across from `sm`: inside the dialog the width is the dialog's, not the page's
        * remaining column, so the tiles are not competing with a sidebar for room.
        */}
      {groupedFontsFor(role).map((group) => (
        <section key={group.id} className="mt-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-[var(--color-text)]">
              {group.label}
            </h4>
            <span className="text-[11px] text-[var(--color-text-muted)]">{group.blurb}</span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">
              {group.options.length}
            </span>
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {group.options.map((option) => {

            const active = option.id === current.id
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                disabled={saving !== null}
                onClick={() => choose(option)}
                className={cn(
                  'anim-press rounded-2xl border p-3 text-left transition-colors disabled:opacity-60',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]/40'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-hover)]',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      active
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                        : 'border-[var(--color-border-strong)]',
                    )}
                    aria-hidden
                  >
                    {active ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  {/* The name, set in itself — which is the fastest possible preview and the reason a
                    * font list is worth looking at rather than reading. */}
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--color-text)]"
                    style={{ fontFamily: option.stack }}
                  >
                    {option.label}
                  </span>
                  {saving === option.id ? (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                      Saving
                    </span>
                  ) : active ? (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-[var(--color-accent)]">
                      In use
                    </span>
                  ) : null}
                </span>

                <span className="mt-2 block text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                  {option.hint}
                </span>

                {/* On a real surface rather than on the tile, so every option is compared against the
                  * same ground the app will actually put it on. */}
                <span className="mt-2.5 block rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
                  <Sample stacks={{ ...inForce, [role]: option.stack }} />
                </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {error ? (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
    </div>
  )
}

const ROLE_TABS: { role: FontRole; label: string; title: string; blurb: string }[] = [
  {
    role: 'body',
    label: 'Interface',
    title: 'Interface font',
    blurb: 'Labels, menus, metadata — everything around a note rather than in it.',
  },
  {
    role: 'note',
    label: 'Notes',
    title: 'Note font',
    blurb:
      'The text inside your notes. Follows the interface font until you pick one here, so a handwritten note is one tap away.',
  },
  {
    role: 'heading',
    label: 'Headings',
    title: 'Heading font',
    blurb:
      'Card titles, page headings and the Tree’s numbers. The Mindstack wordmark keeps its own.',
  },
]

/** One line naming a face, set in itself. What the card shows instead of the grid. */
function CurrentFace({ label, option }: { label: string; option: FontOption }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      <span
        className="min-w-0 truncate text-[14px] font-bold text-[var(--color-text)]"
        style={{ fontFamily: option.stack }}
      >
        {option.label}
      </span>
    </div>
  )
}

/**
 * The two faces the app is set in — summarised here, chosen in a dialog.
 *
 * Two choices rather than one, because they are genuinely separate decisions: a high-contrast serif
 * that makes a beautiful heading is unreadable at 11px, and the UI face that carries metadata best
 * has no personality at a display size. Several entries appear in both lists, for anyone who would
 * rather the app spoke in one voice.
 *
 * The grids live in a dialog rather than on the page. Twenty-five options, each with a worked sample,
 * is three screens of tiles — inline it turned the account page into a corridor you had to walk the
 * whole length of to reach the settings underneath. A choice this large is worth a screen of its own
 * and a scroll of its own; the page keeps the two lines that say what is currently in force, which is
 * all it needed to say.
 *
 * The wordmark is in neither list, and cannot be — it is set in --font-brand, which nothing here can
 * reach. A logo that changes with a preference is not a logo.
 *
 * Personal, never a space's. Two people in a shared space read the same notes, but which face those
 * are easier to read in is a property of the reader — unlike the tab order and the note style, which
 * describe the workspace and are shared.
 */
export function FontSettings() {
  const { user } = useAuth()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const [open, setOpen] = useState(false)
  /*
   * One role at a time.
   *
   * Both grids stacked was two dozen tiles in one scroll — the dialog solved the *page* being three
   * screens tall by making itself three screens tall instead. A switch halves it, and the two lists
   * are a genuine either/or: nobody is comparing a heading serif against a monospace body face in the
   * same glance.
   */
  const [role, setRole] = useState<FontRole>('body')
  const activeTab = ROLE_TABS.find((tab) => tab.role === role) ?? ROLE_TABS[0]!

  return (
    <>
      <div className="mt-4">
        <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
          The faces the app, your notes and its headings are set in. The Mindstack wordmark keeps
          its own either way.
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3.5 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <CurrentFace label="Interface" option={readFontChoice('body', metadata)} />
            <CurrentFace label="Notes" option={readFontChoice('note', metadata)} />
            <CurrentFace label="Headings" option={readFontChoice('heading', metadata)} />
          </div>
          <Button variant="subtle" size="sm" onClick={() => setOpen(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5" aria-hidden />
              Change fonts
            </span>
          </Button>
        </div>
      </div>

      <PickerDialog
        open={open}
        size="lg"
        title="Typography"
        onClose={() => setOpen(false)}
        footer={
          <>
            <span className="text-[11.5px] text-[var(--color-text-muted)]">
              Applied as you tap — close when you like what you see.
            </span>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        {/*
          * Sticky, and it has to be: the switch is how you get to the other list, and a switch that
          * scrolls away is one you have to scroll back up to find. The negative margins and matching
          * padding are what let it sit flush against the dialog's own edges while covering the tiles
          * passing underneath it.
          */}
        <div className="sticky -top-3 z-10 -mx-3 -mt-3 mb-3 bg-[var(--color-surface)] px-3 pb-2.5 pt-3">
          <div
            role="tablist"
            aria-label="Which font to change"
            className="flex rounded-full bg-[var(--color-surface-muted)] p-0.5"
          >
            {ROLE_TABS.map((tab) => (
              <button
                key={tab.role}
                type="button"
                role="tab"
                aria-selected={role === tab.role}
                onClick={() => setRole(tab.role)}
                className={cn(
                  'anim-press flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                  role === tab.role
                    ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                )}
              >
                {tab.label}
                {/* The face currently in force for that role, named on its own tab — so the switch
                  * also answers "what have I got" without being flipped. */}
                <span className="ml-1.5 font-normal opacity-70">
                  {readFontChoice(tab.role, metadata).label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <FontChoices
          role={role}
          title={activeTab.title}
          blurb={activeTab.blurb}
        />
      </PickerDialog>
    </>
  )
}
