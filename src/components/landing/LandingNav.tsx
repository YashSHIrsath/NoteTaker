import { Link } from 'react-router-dom'
import { ArrowRight, Download, LogIn, type LucideIcon } from 'lucide-react'
import { ProjectLogo } from '../brand/ProjectLogo'
import { useActiveSection, usePageProgress, useScrollOffset } from '../../hooks/useLandingScroll'
import { useTheme } from '../../hooks/useTheme'
import { themeOption } from '../../lib/themes'
import { originFromElement } from '../../lib/themeReveal'
import { cn } from '../../lib/cn'

/** Where the bar has finished settling. Short enough to happen on the first flick of the wheel
 *  rather than being a surprise three sections down. */
const SETTLE = 120

const SECTIONS = [
  { id: 'inside', label: 'Inside' },
  { id: 'spaces', label: 'Shared' },
  { id: 'journey', label: 'How it works' },
  { id: 'everything', label: 'Everything' },
]

/** Module scope, so the scroll-spy's effect is not re-keyed by a fresh array on every render. */
const SECTION_IDS = SECTIONS.map((section) => section.id)

/** The mono face is loaded in index.html; there is no token for it, because in this app a
 *  monospace is a *preference* (see lib/fonts) rather than part of the theme. The bar's index
 *  numbers are not a preference, so the stack is spelled out — matching MONO_FALLBACK. */
const MONO = '"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace'

/**
 * The page as a numbered document.
 *
 * ---------------------------------------------------------------- the idea
 *
 * This replaces a floating pill that shrank into a smaller floating pill. The pill's problem was
 * never its shape, it was that everything inside it weighed the same: a mark, four anchors, three
 * grey glyphs and a filled button all at one level, in one undivided tube, so nothing said which
 * of them was navigation and which was an action.
 *
 * So the bar stops being an object and becomes a rule. A real 1.5px line in the text colour — not
 * a tinted hairline — with the page's sections indexed 01–04 above it in the mono face, the
 * secondary actions as cells in a hairline toolbar, and the one action worth taking as the only
 * outlined box on the row. Hierarchy comes from *kind* (a number, a word, a cell, a box) rather
 * than from a lozenge around the important one.
 *
 * ---------------------------------------------------------------- the two states
 *
 * At rest, over the hero, the bar is only its contents: no ground, no rule, white type, the
 * wordmark at full size and the anchors collapsed to nothing. Scrolling lands the ground and the
 * rule under it, shrinks the wordmark, and expands the index into the middle. Nothing slides
 * anywhere and nothing merges — which is why the scroll trace can now be a plain full-width line
 * on the rule itself. The version this replaced needed a mask and a clipping wrapper to stop that
 * line's glow escaping a 999px corner; a rule has no corners.
 *
 * ---------------------------------------------------------------- the grid
 *
 * `1fr auto 1fr`, from 1120px up: the index holds the middle and the two ends split the slack
 * equally, so the anchors are centred on the bar rather than on whatever is left between the mark
 * and the actions. Plain `1fr`, not `minmax(0,1fr)` — an end can take an equal share of the slack
 * but is never squeezed below the content in it, so the two ends can never overlap the middle.
 *
 * Below 1120px there is no index to centre, so the bar is a flex row with space-between, which
 * cannot lay one item over another whatever the width. That is not a cosmetic change: both ends
 * carried `min-w-0`, which overrides the `1fr` floor and lets a track collapse to nothing — and a
 * collapsed track with `justify-self: end` starts its contents 24px in from the left edge, on top
 * of the wordmark. `min-w-0` now lives only on the two things allowed to clip: the index, and the
 * wordmark, which truncates.
 */
export function LandingNav() {
  const offset = useScrollOffset()
  const progress = usePageProgress()
  const { theme, toggleTheme } = useTheme()
  const ThemeIcon = themeOption(theme).icon
  /** The section being read, so the index can say where in the document you are. */
  const activeSection = useActiveSection(SECTION_IDS)
  const t = Math.min(1, offset / SETTLE)
  /** Settled: the bar has its ground, its rule and its index. */
  const settled = t > 0.55

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /**
   * Every word in the bar, at one size and one treatment.
   *
   * Tracked-out micro-caps rather than sentence case: at this size the extra letter-spacing is
   * what keeps four anchors and three actions legible as *labels* instead of reading as a
   * sentence, and it is the whole reason the row fits without the anchors being squeezed.
   */
  const caps = 'text-[11.5px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap'

  /**
   * A cell on the rule — the shape the theme toggle and both secondary actions take once the bar
   * has its ground. Narrower on a phone, where three of these plus the box is most of the row; see
   * the arithmetic on the actions group below.
   *
   * The `display` is deliberately not in here. It is each caller's to set, because one of these
   * cells stands down on a small screen, and `hidden` competing with `flex` in one class list is
   * settled by Tailwind's own output order rather than by the order they are written in.
   */
  const cell =
    'h-[26px] w-[30px] border-l border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] sm:w-[38px]'

  /**
   * A secondary action: its name over the hero, its icon on the rule.
   *
   * Both spellings stay in the DOM and swap by collapsing their width to zero, so the change rides
   * the same 300ms as the ground arriving rather than cutting in one frame. Settled, each is a
   * fixed-width cell divided from its neighbour by a hairline — a toolbar, which is what turns
   * three loose glyphs into one deliberate group.
   */
  const secondaryAction = (
    to: string,
    text: string,
    Icon: LucideIcon,
    restLayout: string,
    settledLayout = 'flex',
  ) => (
    <Link
      to={to}
      // Only when there are no words to read: given both, a screen reader announces the label and
      // ignores the text, so setting it unconditionally would be a second name for the same thing.
      aria-label={settled ? text : undefined}
      title={settled ? text : undefined}
      className={cn(
        'anim-press shrink-0 items-center justify-center transition-all duration-300',
        '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        caps,
        settled ? cn(cell, settledLayout) : restLayout,
      )}
    >
      <span
        className="flex items-center overflow-hidden transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ maxWidth: settled ? '1.1rem' : '0px', opacity: settled ? 1 : 0 }}
      >
        <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.7} aria-hidden />
      </span>
      <span
        className="overflow-hidden transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ maxWidth: settled ? '0px' : '7rem', opacity: settled ? 0 : 1 }}
      >
        {text}
      </span>
    </Link>
  )

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div
        className={cn(
          'pointer-events-auto relative w-full border-b-[1.5px]',
          'transition-[background-color,border-color,backdrop-filter] duration-300',
          '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          settled
            ? 'border-[var(--color-text)] bg-[var(--color-surface)]/95 backdrop-blur-md'
            : 'border-transparent bg-transparent',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div
          className={cn(
            'mx-auto flex w-full max-w-[96rem] items-center justify-between gap-3 px-4 sm:px-7',
            // The three-track grid only earns its keep once the index is on screen. Below that the
            // middle track is display:none and the grid is two items at opposite ends — which is
            // what a flex row with space-between is, and unlike the grid it cannot put one item on
            // top of the other. `justify-between` is inert in grid mode, where the 1fr tracks have
            // already taken all the space.
            'min-[1120px]:grid min-[1120px]:grid-cols-[1fr_auto_1fr]',
            'transition-[height] duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
            'motion-reduce:transition-none',
          )}
          style={{ height: settled ? 64 : 78 }}
        >
          {/* ---------------------------------------------------------- the imprint */}
          <button
            type="button"
            onClick={() => document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label="Mindstack — back to top"
            // The one thing on the row allowed to give, and it gives by truncating the wordmark
            // rather than by pushing anything: `min-w-0` here plus `truncate` on the span. It used
            // to be `shrink-0` as well, which does nothing to a grid item and stopped it shrinking
            // in flex mode — so on a phone the bar had no give at all and the two ends met.
            className="anim-press flex min-w-0 items-center gap-2.5 justify-self-start"
          >
            <ProjectLogo
              className={cn(
                'shrink-0 transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                settled ? 'h-[19px] w-[26px] text-[var(--color-text)]' : 'h-[22px] w-[30px] text-white',
              )}
            />
            {/* The wordmark stays. It collapsed on the old bar because a pill full of sentence-case
              * links had no room for it; micro-caps give the room back, and a bar that names the
              * product is worth more than 90px of slack. It only changes size. */}
            <span
              className={cn(
                'truncate font-extrabold tracking-tight transition-all duration-300',
                '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                settled ? 'text-[var(--color-text)]' : 'text-white',
              )}
              style={{ fontFamily: 'var(--font-brand)', fontSize: settled ? '16px' : '20px' }}
            >
              Mindstack
            </span>
          </button>

          {/* ---------------------------------------------------------- the index
            *
            * In the flow between the two ends, not absolutely centred — `justify-self-center` in a
            * real track is what keeps it off the actions when the window narrows. Collapsed to zero
            * width at rest rather than merely transparent, so over the hero the bar really is just
            * a mark and three actions, with nothing invisible holding them apart.
            */}
          <div
            className={cn(
              // justify-CONTENT, not justify-self. `justify-self: center` sizes a grid item to its
              // content and centres it, so an item wider than its track overflows the track by half
              // on each side — straight over whatever is parked at the ends, which is exactly what
              // it did to the theme control at 1024. Stretched, the item is the track, and the
              // overflow-hidden on it finally means something.
              'hidden min-w-0 items-center justify-center gap-5 overflow-hidden xl:gap-7',
              'transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
              // 1120px, measured rather than picked off the breakpoint list: the index is ~429px
              // and the actions ~306, and centring the first between two ends the width of the
              // second needs 1065px of content box. `lg` (1024) is 100px short of that, which is
              // why it collided; below this the bar is the imprint and the actions, which is a
              // legible bar rather than a squeezed one.
              'motion-reduce:transition-none min-[1120px]:flex',
            )}
            style={{
              maxWidth: settled ? '46rem' : '0px',
              opacity: settled ? 1 : 0,
              pointerEvents: settled ? 'auto' : 'none',
            }}
          >
            {SECTIONS.map((section, index) => {
              const here = section.id === activeSection
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => jump(section.id)}
                  // The section you are reading, announced rather than only coloured.
                  aria-current={here ? 'true' : undefined}
                  className="anim-press group flex shrink-0 items-baseline gap-[7px]"
                >
                  {/* The number carries the mark, not a pill behind the word. On a bar built out of
                    * rules and cells, a lozenge would be the one soft shape on the row — and the
                    * index is the thing that makes this a document, so it is the part that should
                    * light up when you reach its section. */}
                  <span
                    className={cn(
                      'text-[9.5px] font-medium transition-colors',
                      here
                        ? 'text-[var(--color-accent)]'
                        : 'text-[var(--color-border-strong)] group-hover:text-[var(--color-accent)]',
                    )}
                    style={{ fontFamily: MONO }}
                    aria-hidden
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={cn(
                      caps,
                      'text-[12px] transition-colors',
                      here
                        ? 'font-bold text-[var(--color-text)]'
                        : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]',
                    )}
                  >
                    {section.label}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ---------------------------------------------------------- the actions
            *
            * No `min-w-0`, and that is the fix rather than an omission. `1fr` is `minmax(auto, 1fr)`,
            * so the track's floor is whatever is in it — but `min-width: 0` overrides that floor and
            * lets the track collapse to nothing, and a collapsed track with `justify-self: end`
            * leaves its contents laid out from a point 24px in from the left edge. Which is where
            * they were found on a phone: the theme toggle and the download cell underneath the
            * wordmark. Nothing here shrinks; the imprint gives instead.
            */}
          <div className="flex shrink-0 items-center justify-self-end">
            {/* How far down the page you are, as a figure. The line on the rule says it
              * continuously and imprecisely; this says it exactly. From xl only — at lg the row
              * needs every pixel for the index to stay centred. */}
            <span
              className="hidden text-[10px] font-medium tabular-nums text-[var(--color-border-strong)] transition-opacity duration-300 xl:inline"
              style={{ fontFamily: MONO, opacity: settled ? 1 : 0 }}
              aria-hidden
            >
              {Math.round(progress * 100)}%
            </span>

            {/* Tighter on a phone in both states. At 360px the row is 32px of page padding, this
              * group and the box, and the wordmark gets what's left — which at desktop spacing was
              * about 40px, or "Min…". Halving the margins and narrowing the cells gives the
              * wordmark ~130px, which fits "Mindstack" whole. */}
            <div
              className={cn(
                'flex items-center transition-all duration-300',
                '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                settled
                  ? 'ml-2 mr-2 gap-0 border-r border-[var(--color-border)] sm:ml-5 sm:mr-[18px]'
                  : 'mr-3 gap-4 sm:mr-6 sm:gap-5',
              )}
            >
              <button
                type="button"
                onClick={(event) => toggleTheme(originFromElement(event.currentTarget))}
                aria-label="Switch theme"
                className={cn(
                  'anim-press flex shrink-0 items-center justify-center transition-all duration-300',
                  '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                  settled ? cn('flex', cell) : 'text-white/80 hover:text-white',
                )}
              >
                {/* The theme you are in, not the one you would land on. Four of the six are dark,
                  * so a light/dark toggle sat on the same sun through three of them and made the
                  * button look like it had done nothing. */}
                <ThemeIcon className="h-[15px] w-[15px]" strokeWidth={1.7} aria-hidden />
              </button>
              {/* Over the hero this is still gated to xl — as a word it is the one link that is also
                * in the footer, so below xl it gives its width up rather than fighting the others
                * for it. On the rule it is a cell, which costs little enough to always show. */}
              {/* Below sm it stands down on the rule as well as over the hero. It is the one link
                * that is also in the footer, so it is the one that gives its cell up when the row
                * is 360px wide. */}
              {secondaryAction(
                '/get-app',
                'Get app',
                Download,
                'hidden text-white/80 hover:text-white xl:flex',
                'hidden sm:flex',
              )}
              {secondaryAction('/login', 'Sign in', LogIn, 'flex text-white/80 hover:text-white')}
            </div>

            {/* The only box on the row, in both states — filled on the hero where it has to carry
              * against a saturated ground, outlined on the page where the rule is already doing the
              * work and a second filled shape would just shout over it. 2px, not a pill: the whole
              * bar is set square, and a lozenge here would be the one soft thing on a hard row. */}
            <Link
              to="/signup"
              className={cn(
                'anim-press rounded-full flex shrink-0 items-center gap-1.5 rounded-[2px] border-[1.5px] px-3 transition-all duration-300 sm:gap-2 sm:px-[17px]',
                '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                caps,
                settled
                  ? 'h-9 border-[var(--color-text)] text-[var(--color-text)] hover:bg-[var(--color-text)] hover:text-[var(--color-surface)]'
                  : 'h-[38px] border-white bg-white text-[var(--color-accent)] hover:bg-white/90',
              )}
            >
              {/* Three lengths, because this must never be the thing that wraps the bar. */}
              <span className="min-[400px]:hidden">Join</span>
              <span className="hidden min-[400px]:inline sm:hidden">Sign up</span>
              <span className="hidden sm:inline">Create account</span>
              <ArrowRight className="h-[13px] w-[13px] shrink-0" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>

        {/*
          * How much of the page is left, drawn on the rule itself.
          *
          * A plain full-width line, and that is the point: the bar has square ends now, so the
          * trace needs neither the end-mask that stopped it jutting past a 999px curve nor the
          * clipping wrapper that kept its glow inside one. It sits exactly on the 1.5px rule and
          * reads as that rule filling in.
          */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-[1.5px] h-[1.5px] transition-opacity duration-500"
          style={{ opacity: settled ? 1 : 0 }}
        >
          <span
            className="block h-full w-full origin-left bg-[var(--color-accent)]"
            style={{ transform: `scaleX(${progress})` }}
          />
        </span>
      </div>
    </div>
  )
}
