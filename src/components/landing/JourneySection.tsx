import { useRef, useState } from 'react'
import { Bell, CalendarClock, CheckCircle2, PenLine, Users } from 'lucide-react'
import { useProgressTarget } from '../../hooks/useLandingScroll'
import { cn } from '../../lib/cn'

const STEPS = [
  {
    icon: <PenLine className="h-4 w-4" aria-hidden />,
    when: 'Monday',
    title: 'You write it down',
    body: 'A note in a folder. Text, a checklist, the PDF somebody sent you — whatever shape the thing arrived in.',
  },
  {
    icon: <CalendarClock className="h-4 w-4" aria-hidden />,
    when: 'Monday, still',
    title: 'You give it a date',
    body: 'Now it is a task. It counts down against the server’s clock, not your device’s, so it is the same number on your phone and your laptop.',
  },
  {
    icon: <Bell className="h-4 w-4" aria-hidden />,
    when: 'Thursday, 09:00',
    title: 'It emails you first',
    body: 'The reminder was scheduled in the database when you set it, in the timezone you set it in. It fires with every browser you own shut.',
  },
  {
    icon: <Users className="h-4 w-4" aria-hidden />,
    when: 'Thursday, 09:12',
    title: 'Someone else picks it up',
    body: 'In a shared space, the note is theirs to work on too — and the log records that it was them, not you, and what it said before they touched it.',
  },
  {
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
    when: 'Friday',
    title: 'It remembers you beat it',
    body: 'Finished early, on time or late is not the same fact as finished, and the app keeps all three. A month later you can still see which it was.',
  },
]

/**
 * The one section on this page that is a *sequence*, so it is the one drawn as a line.
 *
 * The rest of the page is claims — here are the parts, here is what each does. This is the only place
 * that answers "and then what happens", which is the question somebody deciding whether to sign up is
 * actually asking. A note becoming a task becoming an email becoming a record is the whole product in
 * five beats, and it is worth its own section because no feature list can say it.
 *
 * The line is scrubbed rather than triggered: it draws itself from your scroll position, and each step
 * lights as the line reaches it. Which is the point of doing it this way — a set of blocks that each
 * faded in would be the same reveal used a fifth and sixth time, and would say nothing about order.
 * A line you are pulling downward says "this happens, then this" without a word.
 */
export function JourneySection() {
  // Measured on the steps themselves rather than on the section: the section includes its heading and
  // its padding, and a line drawn against that is offset from the rows it is supposed to track.
  const stepsRef = useRef<HTMLDivElement | null>(null)
  const lineRef = useRef<HTMLSpanElement>(null)
  /**
   * How many steps the line has passed — the only part of the scroll this section renders.
   *
   * The line itself is written straight to the DOM below, because it moves continuously and putting
   * it in state re-rendered five steps and their markers on every frame of every scroll, whether or
   * not the section was even on screen. Which step is lit is a different kind of answer: it changes
   * five times in the section's whole travel, so it is worth a render each time and nothing between.
   *
   * Guarded against a ref rather than left to React to notice: setting state to the value it
   * already holds is not reliably free, and this would be doing it sixty times a second.
   *
   * Starts at 1 because the measurement starts at 0, which already reaches the first step — the
   * marker is lit before you have scrolled, exactly as it was when this was computed in the render.
   */
  const [litCount, setLitCount] = useState(1)
  const litRef = useRef(1)

  /*
   * The measurement is taken on the list, not the section, and used as-is.
   *
   * useProgressTarget reports where a playhead at the middle of the screen sits within the element
   * — so for the list of steps that is already exactly "how far down the steps am I", and any
   * remapping would put the line somewhere other than beside the row being read. An earlier version
   * remapped a whole-viewport measure and the line arrived four-fifths drawn, which is what made it
   * look stuck.
   */
  useProgressTarget(stepsRef, (drawn) => {
    if (lineRef.current) {
      // scaleY on a full-height element rather than an animated height: height is a layout property
      // and would reflow the section on every frame of the scroll.
      lineRef.current.style.transform = `scaleY(${drawn})`
    }
    // A step lights when the line has reached it. Slightly early — the marker filling in just
    // before the line arrives reads as the line *causing* it, which is the illusion wanted.
    let reached = 0
    for (let index = 0; index < STEPS.length; index += 1) {
      if (drawn >= index / STEPS.length - 0.04) {
        reached = index + 1
      }
    }
    if (litRef.current !== reached) {
      litRef.current = reached
      setLitCount(reached)
    }
  })

  return (
    <section id="journey" className="border-t border-[var(--color-border)] py-14 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">
          One week, end to end
        </p>
        <h2
          className="mt-2.5 text-[26px] font-extrabold leading-[1.08] tracking-tight [text-wrap:balance] sm:text-[36px] lg:text-[40px]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          What actually happens to a note
        </h2>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--color-text-muted)] sm:text-[15px]">
          Every other section on this page lists parts. This is the one that says what they do
          together, which is the thing worth knowing before you make an account.
        </p>
      </div>

      <div ref={stepsRef} className="relative mt-10 pl-11 sm:pl-16">
        {/* The track, and the line being pulled down it. Two elements rather than one animated
          * height: the faint track has to be visible from the start, or the steps below the fold look
          * unconnected to the ones above it. */}
        <span
          aria-hidden
          className="absolute bottom-2 left-[15px] top-2 w-[2px] rounded-full bg-[var(--color-border)] sm:left-[19px]"
        />
        <span
          ref={lineRef}
          aria-hidden
          className="absolute left-[15px] top-2 w-[2px] origin-top rounded-full bg-[var(--color-accent)] sm:left-[19px]"
          style={{
            bottom: '0.5rem',
            transform: 'scaleY(0)',
            transition: 'transform 120ms linear',
          }}
        />

        <ol className="flex flex-col gap-9 sm:gap-11">
          {STEPS.map((step, index) => {
            const lit = index < litCount
            return (
              <li key={step.title} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    // Centred on the line at both sizes: 32px box at left 0 centres on 16, 40px box
                    // at left 0 centres on 20, and the track sits at 15/19 to match.
                    'absolute -left-11 top-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-500 sm:-left-16 sm:h-10 sm:w-10',
                    '[transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                    lit
                      ? 'scale-100 border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                      : 'scale-90 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]',
                  )}
                >
                  {step.icon}
                </span>

                <div
                  className={cn(
                    'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
                    'motion-reduce:transition-none',
                    lit ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-45',
                  )}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                    {step.when}
                  </p>
                  <h3
                    className="mt-1 text-[19px] font-extrabold tracking-tight sm:text-[22px]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-[var(--color-text-muted)] sm:text-[14.5px]">
                    {step.body}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
