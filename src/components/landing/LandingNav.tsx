import { Link } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { ProjectLogo } from '../brand/ProjectLogo'
import { usePageProgress, useScrollOffset } from '../../hooks/useLandingScroll'
import { useTheme } from '../../hooks/useTheme'
import { originFromElement } from '../../lib/themeReveal'
import { cn } from '../../lib/cn'

/** Where the two pills have finished closing on each other. Short enough to happen on the first flick
 *  of the wheel rather than being a surprise three sections down. */
const SETTLE = 120

const SECTIONS = [
  { id: 'inside', label: 'Inside' },
  { id: 'spaces', label: 'Shared' },
  { id: 'journey', label: 'How it works' },
  { id: 'everything', label: 'Everything' },
]

/**
 * Two pills at rest, one pill once you scroll.
 *
 * ---------------------------------------------------------------- the shape
 *
 * At the top of the page the brand and the actions are two separate floating pills at opposite ends of
 * the hero — which is what the hero wants, because its own headline is the thing that should own the
 * middle of the screen. As you scroll, the row they sit in narrows until they meet, their individual
 * backgrounds fade out, and a single themed pill fades in behind both. The wordmark goes with them:
 * once the bar is a compact pill the mark alone names the app, and "Mindstack" in it is just width.
 *
 * Which is done as one container plus two groups rather than as two elements sliding together. The
 * groups own a background at rest and the container owns one after; between the two, `justify-between`
 * inside a shrinking max-width does all the moving. Two absolutely-positioned pills animating toward a
 * meeting point would need to know their own widths to know where to stop.
 *
 * ---------------------------------------------------------------- the colours
 *
 * Interpolated geometry, switched colour. Width, padding and radius all come from one number, `t`, so
 * they cannot get out of step. The colours swap at a threshold and cross-fade, because a colour that
 * has to be legible in both themes cannot be computed here from a scroll offset — the theme's values
 * are not available to JavaScript, and guessing them is how the previous version ended up as white
 * type on a white page, which is why nobody could find it.
 */
export function LandingNav() {
  const offset = useScrollOffset()
  const progress = usePageProgress()
  const { theme, toggleTheme } = useTheme()
  const t = Math.min(1, offset / SETTLE)
  /** Merged, and therefore themed rather than white-on-accent. */
  const merged = t > 0.55

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** One row of classes for every control, so none can be legible while another is not. */
  const control = merged
    ? 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]'
    : 'text-white/85 hover:bg-white/15 hover:text-white'

  /** The pill each group wears while they are still apart, and drops once the container has one. */
  const group = cn(
    'flex items-center rounded-full transition-all duration-300',
    '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
    merged
      ? 'border-transparent bg-transparent px-0 shadow-none backdrop-blur-none'
      : 'border border-white/20 bg-white/10 px-2 py-1.5 shadow-[0_8px_28px_-10px_rgba(0,0,0,0.45)] backdrop-blur-md',
  )

  /** Every label in the bar, at one size. A nav where the links and the actions are set differently
   *  reads as two bars that happen to be touching. */
  const label = 'text-[14px] font-semibold'

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-2.5 pt-[max(0.6rem,env(safe-area-inset-top))] sm:px-5 sm:pt-3">
      <div
        className={cn(
          /*
           * auto | minmax(0,1fr) | auto — and the track sizing is the whole fix.
           *
           * This was `minmax(0,1fr) auto minmax(0,1fr)`, which reads as "centre the middle between two
           * equal columns" and behaves as something else entirely: `minmax(0,…)` *explicitly permits a
           * track to collapse to zero*, and a grid item wider than its track does not wrap — it
           * overlaps. So the actions column shrank to nothing and its buttons ran leftward straight
           * across "Everything", which is why widening the pill twice changed nothing.
           *
           * The ends are `auto` now: sized to their content, so they can never be squeezed and never
           * overlap anything. The middle is the only flexible track, and it is the one that should
           * yield — it holds optional anchors, and it clips them rather than colliding.
           *
           * overflow-hidden is for the progress trace's glow, which is a box-shadow and so paints
           * outside its element — it was spilling past the pill's bottom-right corner. Clipped to the
           * pill's own radius, it cannot.
           */
          'pointer-events-auto relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto]',
          'items-center gap-2 overflow-hidden border',
          'transition-[max-width,padding,border-radius,background-color,box-shadow,border-color] duration-300',
          '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
          merged
            ? 'border-[var(--color-border)] bg-[var(--color-surface)]/90 shadow-[var(--shadow-lg)] backdrop-blur-xl'
            : 'border-transparent bg-transparent shadow-none',
        )}
        style={{
          /*
           * 58rem merged, and that number is a measurement rather than a taste.
           *
           * The pill holds three groups — brand, four section links, four actions — which come to
           * about 800px of content plus its gaps. At 50rem there were 800px of content in 800px of
           * box, so the two `1fr` columns collapsed to nothing and the actions group overflowed its
           * track straight over "Everything". A grid item is allowed to be wider than its track; it
           * does not wrap, it overlaps, which is exactly what the screenshot showed.
           *
           * 58rem leaves the outer columns real width to hold, so the links stay centred and nothing
           * can reach anything else. It is only ever shown from `lg`, where the viewport has the room.
           */
          maxWidth: `${76 - t * 18}rem`,
          paddingLeft: merged ? '0.55rem' : '0rem',
          paddingRight: merged ? '0.55rem' : '0rem',
          paddingTop: merged ? '0.5rem' : '0rem',
          paddingBottom: merged ? '0.5rem' : '0rem',
          borderRadius: '999px',
        }}
      >
        {/* ------------------------------------------------------------ the brand pill */}
        <div className={cn(group, 'justify-self-start')}>
          <button
            type="button"
            onClick={() => document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label="Mindstack — back to top"
            className={cn(
              // py-1.5 matches the links and the actions: at py-1 the brand was two pixels shorter
              // than everything beside it, which items-center centres and the eye still reads as a
              // logo floating slightly high.
              'anim-press flex shrink-0 items-center gap-2 rounded-full px-2 py-1 transition-colors',
              merged ? 'text-[var(--color-text)]' : 'text-white',
            )}
          >
            <ProjectLogo
              className={cn(
                'h-[22px] w-[30px] shrink-0 transition-colors',
                merged ? 'text-[var(--color-accent)]' : 'text-white',
              )}
            />
            {/* Gone once the pills have merged — the mark alone names the app there, and the width is
              * wanted for the section links instead. Width and opacity together, so it collapses out
              * of the row rather than leaving a gap behind it. */}
            <span
              className="overflow-hidden whitespace-nowrap font-extrabold tracking-tight transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: '1.2rem',
                maxWidth: merged ? '0px' : '8rem',
                opacity: merged ? 0 : 1,
                marginLeft: merged ? '0px' : undefined,
              }}
            >
              Mindstack
            </span>
          </button>
        </div>

        {/* ------------------------------------------------------------ the section links
          *
          * In the flow, between the two groups — not absolutely centred, which is what put them on top
          * of "Get app" and "Sign in" the moment the container narrowed. `justify-between` can only
          * keep three things apart if all three are actually in the row.
          *
          * Collapsed to zero width at rest rather than merely transparent, so the two pills really do
          * sit at the ends of the hero and are not being held apart by an invisible row of anchors.
          * They expand as the pills meet, which is what gives the merged pill its middle.
          */}
        <div
          className="hidden min-w-0 items-center justify-self-center gap-0.5 overflow-hidden transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:flex"
          style={{
            maxWidth: merged ? '32rem' : '0px',
            opacity: merged ? 1 : 0,
            pointerEvents: merged ? 'auto' : 'none',
          }}
        >
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => jump(section.id)}
              className={cn(
                'anim-press whitespace-nowrap rounded-full px-3.5 py-2 transition-colors',
                label,
                control,
              )}
            >
              {section.label}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------------ the actions pill */}
        <div className={cn(group, 'justify-self-end gap-0.5 sm:gap-1')}>
          <button
            type="button"
            onClick={(event) => toggleTheme(originFromElement(event.currentTarget))}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'anim-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
              control,
            )}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden />
            ) : (
              <Moon className="h-4 w-4" aria-hidden />
            )}
          </button>
          <Link
            to="/get-app"
            className={cn(
              // From xl, not md: the merged pill has the brand, four anchors and three actions to
              // fit, and this is the one link that is also in the footer. Below xl it gives up its
              // width to the anchors rather than the two of them fighting for it.
              'anim-press hidden shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 transition-colors xl:inline-flex',
              label,
              control,
            )}
          >
            Get app
          </Link>
          <Link
            to="/login"
            className={cn(
              'anim-press shrink-0 whitespace-nowrap rounded-full px-3 py-2 transition-colors sm:px-3.5',
              label,
              control,
            )}
          >
            Sign in
          </Link>
          {/* The one control that stays filled in both states: it is legible on the hero and on the
            * page, and it is the thing the whole bar exists to offer. */}
          <Link
            to="/signup"
            className={cn(
              'anim-press shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[14px] font-bold transition-all sm:px-5',
              'hover:scale-[1.03]',
              merged ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[var(--color-accent)]',
            )}
          >
            {/* Three lengths, because this button must never be the thing that wraps the bar. */}
            <span className="min-[400px]:hidden">Join</span>
            <span className="hidden min-[400px]:inline sm:hidden">Sign up</span>
            <span className="hidden sm:inline">Create account</span>
          </Link>
        </div>

        {/*
          * How much of the page is left.
          *
          * A soft trace rather than a rule. The first version was a hard 2px accent bar pinned to
          * `bottom-0`, which put a solid slab across the pill's own edge — it read as a broken border
          * rather than as a measure, and it was the loudest thing in a bar whose whole job is to stay
          * out of the way.
          *
          * So: inset off the border on all three sides, clipped to its own radius, and drawn as a
          * gradient that starts at a quarter strength and reaches full only at the leading edge — with
          * a glow under it instead of weight. What you notice is the bright head moving; the tail
          * behind it dissolves into the pill.
          */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] transition-opacity duration-500"
          style={{
            opacity: merged ? 1 : 0,
            /*
             * The blend is here, and it is what makes this work.
             *
             * The line runs the pill's full width and sits on its very bottom edge — where a measure
             * belongs. But the pill is a 999px radius, so a full-width line's ends would jut out past
             * the curve as two little stubs. Masking both ends to transparent lets it dissolve exactly
             * where the corner turns, so there is no end to see.
             *
             * Inset padding was the wrong answer to the same problem: it moved the line off the edge
             * and into the bar, which put a floating rule under the buttons instead.
             */
            maskImage:
              'linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%)',
          }}
        >
          <span
            className="block h-full w-full origin-left"
            style={{
              transform: `scaleX(${progress})`,
              // Faint at the tail, solid at the head. Scaling the element scales the gradient with it,
              // which is what keeps the bright end *at* the end however far along it is.
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 15%, transparent), var(--color-accent))',
              // A glow rather than a thicker line: weight without an edge.
              boxShadow: '0 0 8px 1px color-mix(in srgb, var(--color-accent) 35%, transparent)',
              opacity: 0.8,
            }}
          />
        </span>
      </div>
    </div>
  )
}
