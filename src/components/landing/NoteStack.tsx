import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlarmClock,
  Check,
  CheckCircle2,
  Paperclip,
  Star,
  Timer,
} from 'lucide-react'
import { cn } from '../../lib/cn'

/** How long each card holds the front of the deck. */
const DWELL_MS = 3000
/** How long the outgoing card takes to be dealt away. Matches anim-card-deal. */
const DEAL_MS = 700
/** How many cards are drawn behind the front one. More than two is a smudge at this size. */
const DEPTH = 2

interface DeckCard {
  key: string
  /** The palette name the card is painted in — the same tokens a real note uses. */
  colour: 'indigo' | 'emerald' | 'amber' | 'rose' | 'teal'
  crumbs: string
  title: string
  /** The pill top-right: a countdown, a done stamp, a reminder. What makes each card a *kind*. */
  badge: { icon: ReactNode; text: string; tone: 'live' | 'done' | 'wait' }
  tags: string[]
  body: ReactNode
  files?: string[]
}

/**
 * A checklist, drawn the way the editor really draws one.
 *
 * `done` is a count rather than a list of booleans: every one of these is "the first n are ticked",
 * and two parallel arrays that could disagree is a worse shape than one number.
 */
function Checklist({ items, done }: { items: string[]; done: number }) {
  return (
    <div className="space-y-2">
      {items.map((line, index) => (
        <p key={line} className="flex items-start gap-2">
          <span
            className={cn(
              'mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
              index < done
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                : 'border-[var(--color-border-strong)]',
            )}
            aria-hidden
          >
            {index < done ? <Check className="h-2.5 w-2.5" /> : null}
          </span>
          <span className={index < done ? 'text-[var(--color-text-muted)] line-through' : undefined}>
            {line}
          </span>
        </p>
      ))}
    </div>
  )
}

/**
 * The deck.
 *
 * Five notes, because one told you the app holds notes and nothing about what people keep in them.
 * A job application counting down, a recipe, a reading list on a weekly reminder, a trip, an invoice
 * paid two days early — different colours, different shapes, one of each kind of thing the app
 * tracks. The point is made by the variety, not by the copy beside it.
 */
const CARDS: DeckCard[] = [
  {
    key: 'interview',
    colour: 'indigo',
    crumbs: 'Notes → Job hunt → Oracle',
    title: 'Interview prep',
    badge: { icon: <Timer className="h-2.5 w-2.5" aria-hidden />, text: '2d 4h left', tone: 'live' },
    tags: ['# career', 'Pending'],
    body: (
      <>
        <p className="text-[var(--color-text-muted)]">Three questions to have ready:</p>
        <div className="mt-2.5">
          <Checklist
            items={[
              'Walk through the sync design',
              'Where reminders are scheduled',
              'What I’d do differently',
            ]}
            done={1}
          />
        </div>
      </>
    ),
    files: ['resume.pdf', 'jd.docx'],
  },
  {
    key: 'dal',
    colour: 'rose',
    crumbs: 'Notes → Kitchen → Sunday',
    title: 'The good dal',
    badge: { icon: <Star className="h-2.5 w-2.5" aria-hidden />, text: 'Starred', tone: 'wait' },
    tags: ['# recipes', '# vegan'],
    body: (
      <>
        <p className="text-[var(--color-text-muted)]">
          Forty minutes, lid off for the last ten. Tomatoes after the spices bloom, never before.
        </p>
        <div className="mt-2.5">
          <Checklist
            items={['200g red lentils, rinsed', 'Bloom cumin and mustard seed', 'Tamarind off the heat']}
            done={2}
          />
        </div>
      </>
    ),
  },
  {
    key: 'reading',
    colour: 'emerald',
    crumbs: 'Notes → Reading',
    title: 'Finish before the flight',
    badge: {
      icon: <AlarmClock className="h-2.5 w-2.5" aria-hidden />,
      text: 'Every Sunday, 9:00',
      tone: 'wait',
    },
    tags: ['# books'],
    body: (
      <div className="mt-0.5">
        <Checklist
          items={['Piranesi — 40 pages left', 'The Peregrine', 'Notes on the second half']}
          done={1}
        />
      </div>
    ),
  },
  {
    key: 'trip',
    colour: 'teal',
    crumbs: 'Notes → Trips → Kyoto',
    title: 'Five days in Kyoto',
    badge: {
      icon: <Timer className="h-2.5 w-2.5" aria-hidden />,
      text: 'in 3 weeks',
      tone: 'live',
    },
    tags: ['# travel', 'Ongoing'],
    body: (
      <>
        <p className="text-[var(--color-text-muted)]">
          Fushimi at dawn, before the coaches. Book the ryokan by Friday.
        </p>
        <div className="mt-2.5">
          <Checklist items={['Ryokan — 2 nights', 'JR pass', 'Tea house, Wednesday']} done={1} />
        </div>
      </>
    ),
    files: ['itinerary.pdf'],
  },
  {
    key: 'invoice',
    colour: 'amber',
    crumbs: 'Notes → Freelance → June',
    title: 'Invoice #114',
    badge: {
      icon: <CheckCircle2 className="h-2.5 w-2.5" aria-hidden />,
      text: 'Done, 2 days early',
      tone: 'done',
    },
    tags: ['# invoices', 'Paid'],
    body: (
      <>
        <p className="text-[var(--color-text-muted)]">
          Sent 3 June, paid 12 June. Terms were fourteen days.
        </p>
        <div className="mt-2.5">
          <Checklist items={['Send', 'Chase once', 'File the receipt']} done={3} />
        </div>
      </>
    ),
    files: ['invoice-114.pdf'],
  },
]

const TONE_CLASSES: Record<DeckCard['badge']['tone'], string> = {
  live: 'bg-[var(--cat-amber-soft)] text-[var(--cat-amber-ink)]',
  done: 'bg-[var(--cat-emerald-soft)] text-[var(--cat-emerald-ink)]',
  wait: 'bg-[var(--color-hover)] text-[var(--color-text-muted)]',
}

export interface NoteStackProps {
  className?: string
}

/**
 * The hero's picture: a deck of notes that deals itself.
 *
 * It was one static card. One card is a claim that the app holds a note; a deck that keeps turning
 * over is a claim about the range of things people keep in it, and it makes that claim in three
 * seconds without a word of copy. Drawn with the app's own pills, tokens and checkboxes rather than
 * screenshots, which go stale the first time a card changes shape.
 *
 * Nothing mounts or unmounts as it turns. Every card is rendered once and its *depth* is derived
 * from how far it is from the front — so the deck is five elements whose transforms change, and the
 * browser animates transform and opacity, which it can do on the compositor. Cross-fading mounted
 * and unmounted cards instead would mean five card layouts thrashing every three seconds on the one
 * page a first-time visitor judges the app by.
 *
 * Reduced motion stops the dealing entirely rather than making it instant. The point of the
 * animation is the variety, and somebody who has asked for no motion can still see it by tapping.
 */
export function NoteStack({ className }: NoteStackProps) {
  const [front, setFront] = useState(0)
  const [paused, setPaused] = useState(false)
  /*
   * The card on its way to the back — and while it is, the front card has not changed yet.
   *
   * That ordering is the whole thing, and the first version had it wrong. It dealt the outgoing card
   * away *and* promoted the next one in the same instant, so two cards moved at once and the turn read
   * as a cross-fade with a flourish. What a hand actually does is one thing then the other: the card
   * you are looking at leaves, and only once it has gone does the next come forward.
   *
   * So a turn is two phases. `dealing` names the front card and it animates off; `front` stays exactly
   * where it is, which leaves the card beneath sitting in plain view behind the gap. Then, 700ms later,
   * `front` advances — and the depth transition brings that card forward on its own.
   */
  const [dealing, setDealing] = useState<number | null>(null)
  const dealTimer = useRef<number | null>(null)

  /** Phase one: send the card you are looking at to the back. Phase two follows on its own. */
  const turn = useCallback((current: number, next: number) => {
    if (next === current) {
      return
    }
    if (dealTimer.current !== null) {
      window.clearTimeout(dealTimer.current)
    }
    setDealing(current)
    dealTimer.current = window.setTimeout(() => {
      setFront(next)
      setDealing(null)
      dealTimer.current = null
    }, DEAL_MS)
  }, [])

  /** A dot is a jump, not a shuffle: nobody expects to watch a deal after asking for card four. */
  const jumpTo = useCallback((next: number) => {
    if (dealTimer.current !== null) {
      window.clearTimeout(dealTimer.current)
      dealTimer.current = null
    }
    setDealing(null)
    setFront(next)
  }, [])

  useEffect(
    () => () => {
      if (dealTimer.current !== null) {
        window.clearTimeout(dealTimer.current)
      }
    },
    [],
  )

  /*
   * A timeout per card rather than one interval for the deck.
   *
   * Keyed on the front card, so it is torn down and set again after every turn — which is what makes
   * DWELL_MS mean what it says. An interval measures three seconds between *starts*, so the 700ms
   * deal was eating into the dwell and each card was actually readable for 2.3; this gives each one a
   * full three seconds at the front and then deals.
   *
   * It also removes the need to hold the front card in a ref to escape a stale closure — the effect
   * simply depends on it. `dealing !== null` keeps a new timer from being armed mid-deal, which would
   * otherwise queue a second turn behind the one in flight.
   */
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || paused || dealing !== null) {
      return
    }
    const timer = window.setTimeout(() => {
      turn(front, (front + 1) % CARDS.length)
    }, DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [dealing, front, paused, turn])

  return (
    <div
      className={cn('relative mx-auto w-full max-w-md lg:mx-0', className)}
      /*
       * Paused while a pointer is on it, or while anything inside has focus.
       *
       * A deck that keeps dealing while somebody is reading a card is a deck that takes the card
       * away mid-sentence. Focus counts as well as hover: the dots are buttons, and tabbing onto one
       * only to have the deck move underneath is the keyboard version of the same problem.
       */
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/*
        * A fixed-height stage, and every card fills it.
        *
        * Two reasons, and the second one was a visible bug. Without a height the container would
        * collapse, since the cards are absolutely positioned — and a height that followed the front
        * card's content would make the whole hero jump every three seconds.
        *
        * But the cards also have to be the same height as each other, which is what `inset-0` below
        * is for. Sized to their own content they were not: a card with two attachments is taller than
        * one with a three-line checklist, so whenever a tall card sat behind a short one its bottom
        * inches — an attachment pill, half a checklist row — hung out below the front card and the
        * stack looked like three overlapping sheets of paper rather than a deck.
        */}
      {/* Shorter on a phone, where the hero has to fit a headline, two paragraphs, a button and
        * this. The cards are inset-0 so they simply follow it. */}
      <div className="relative h-[292px] min-[400px]:h-[330px] sm:h-[372px]">
        {CARDS.map((card, index) => {
          // 0 is the front, then 1 and 2 behind it, and everything else parked out of sight ready to
          // come round again. Modulo, so the deck loops without any card ever moving backwards.
          const depth = (index - front + CARDS.length) % CARDS.length
          const hidden = depth > DEPTH
          const leaving = dealing === index
          /*
           * The card arriving gets its lift only once the leaving one has gone.
           *
           * It is depth 1 during the deal and depth 0 after, so keying the landing animation on
           * "depth 0 and nothing is being dealt" makes it fire on the promotion rather than alongside
           * the deal — which is exactly the sequence being fixed here.
           */
          const landing = depth === 0 && dealing !== null && dealing !== index
          return (
            <article
              key={card.key}
              aria-hidden={depth !== 0}
              className={cn(
                // inset-0, so every card is exactly the stage's size — see the note above.
                // origin-top, so the ones behind fan *upward*: scaling from the bottom pulled their
                // tops down behind the front card, which hid the very sliver that makes a stack read
                // as a stack. overflow-hidden is the belt to inset-0's braces.
                'absolute inset-0 origin-top overflow-hidden rounded-3xl border p-4 sm:p-5',
                'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]',
                'shadow-[var(--shadow-lg)] transition-all duration-[600ms]',
                '[transition-timing-function:var(--motion-spring)] motion-reduce:transition-none',
                // The two cards taking part in a turn. The keyframes override the depth transform
                // for their duration, which is the whole mechanism — see anim-card-deal.
                leaving && 'anim-card-deal',
                landing && 'anim-card-land',
              )}
              style={{
                /*
                 * Behind means smaller, higher up and turned a little — the fan that makes a stack
                 * read as a stack. The front card is square on and unscaled.
                 *
                 * With origin-top, scaling shortens a card from its bottom edge upward, so a card
                 * behind can never reach below the front one however tall its content would have
                 * been. The lift is what puts its top edge on show above the front card's.
                 */
                transform: `translateY(${depth * -14}px) scale(${1 - depth * 0.045}) rotate(${
                  depth === 0 ? 0 : depth % 2 === 0 ? 1.4 : -1.4
                }deg)`,
                // The dealt card is already at the back of the stack by the time the animation
                // starts, where this would have it invisible — so opacity is left to the keyframes
                // while it is in flight. Without this the deal would be over before it was seen.
                opacity: leaving ? undefined : hidden ? 0 : 1 - depth * 0.28,
                // The front card must sit above the ones behind it, and a card on its way round must
                // not cross in front of anything.
                zIndex: CARDS.length - depth,
                // Only the front card is touchable; the rest are decoration.
                pointerEvents: depth === 0 ? 'auto' : 'none',
                // Likewise the transform: the keyframes own it for the length of the deal.
                ...(leaving ? { transform: undefined } : null),
              }}
            >
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-text-muted)]">
                  {card.crumbs}
                </p>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
                    TONE_CLASSES[card.badge.tone],
                  )}
                >
                  {card.badge.icon}
                  {card.badge.text}
                </span>
              </div>

              <h3
                className="mt-1.5 truncate text-[19px] font-extrabold tracking-tight sm:text-[21px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {card.title}
              </h3>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                    style={{
                      background: `var(--cat-${card.colour}-soft)`,
                      color: `var(--cat-${card.colour}-ink)`,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-3.5 border-t border-[var(--color-border)] pt-3.5 text-[13.5px] leading-relaxed">
                {card.body}
              </div>

              {card.files ? (
                <div className="mt-3.5 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
                  {card.files.map((file) => (
                    <span
                      key={file}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11.5px] font-medium"
                    >
                      <Paperclip className="h-3 w-3" aria-hidden />
                      {file}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {/* Dots, on the accent field the hero paints — so they are white here rather than themed.
        * They are the reduced-motion path as much as a control: with the dealing switched off, this
        * is how the rest of the deck gets seen. */}
      <div className="mt-5 flex items-center justify-center gap-2 lg:justify-start">
        {CARDS.map((card, index) => (
          <button
            key={card.key}
            type="button"
            aria-label={`Show ${card.title}`}
            aria-current={index === front}
            onClick={() => jumpTo(index)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              index === front ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70',
            )}
          />
        ))}
      </div>
    </div>
  )
}
