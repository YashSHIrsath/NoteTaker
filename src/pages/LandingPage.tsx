import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  CalendarClock,
  ClipboardList,
  FolderTree,
  History,
  ListTree,
  Lock,
  Palette,
  Paperclip,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Star,
  UserPlus,
  Users,
} from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { ProjectLogo } from '../components/brand/ProjectLogo'
import { FeatureCarousel } from '../components/landing/FeatureCarousel'
import { JourneySection } from '../components/landing/JourneySection'
import { LandingNav } from '../components/landing/LandingNav'
import { Reveal } from '../components/landing/Reveal'
import { ScrollRootProvider, useScrollOffset } from '../hooks/useLandingScroll'
import { NoteStack } from '../components/landing/NoteStack'
import { cn } from '../lib/cn'

/**
 * Everything on this page is something the app actually does today. No roadmap items, no
 * capabilities it doesn't have (there's no sharing, no collaboration, no offline editing), and no
 * claims about scale or security beyond what the code and the Supabase project really provide.
 */
/**
 * The full list, arranged as an argument rather than an inventory.
 *
 * This was eleven identical boxes in a three-column grid — every feature the same size, in no order,
 * each one a name and a paragraph. Which is a list, and a list makes the reader do the work of
 * deciding what matters and how the parts relate. Nothing in it was wrong; it just said "here are
 * eleven things" eleven times.
 *
 * Three chapters instead, in the order somebody actually meets the app: get it written down, put a
 * date on it, find it again next week. The same eleven capabilities, now with a claim attached to
 * each group and one line apiece — which is both shorter to read and more informative than the
 * paragraphs were, because the grouping carries meaning the paragraphs had to spell out.
 *
 * Everything here is something the app does today. "Worth knowing first" below is the other half of
 * that promise and is held to it just as strictly.
 */
/**
 * The four questions anybody asks before putting shared work somewhere.
 *
 * Not a feature list — an answer each to "who gets in", "what can they do", "what happens when
 * somebody breaks something" and "does this touch my own notes". Every one is enforced in the
 * database rather than in the interface, which is the only version of these answers worth printing.
 */
const SPACE_CLAIMS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <UserPlus className="h-4 w-4" aria-hidden />,
    title: 'Invited by name',
    body: 'An invitation is emailed to one address and opens only for that address. Forward the link and it admits nobody.',
  },
  {
    icon: <ShieldCheck className="h-4 w-4" aria-hidden />,
    title: 'Four roles, enforced below',
    body: 'Owner, admin, editor, viewer. A viewer’s write is refused by the database, not merely by a hidden button.',
  },
  {
    icon: <History className="h-4 w-4" aria-hidden />,
    title: 'Nothing happens quietly',
    body: 'Every change is recorded as it happens — who, what, and what it was before — on a log nobody can edit after the fact. Filter it by person and by kind.',
  },
  {
    icon: <Lock className="h-4 w-4" aria-hidden />,
    title: 'Your own notes stay yours',
    body: 'A space is separate from your notebook. A personal folder is copied in, never moved, and the original is untouched.',
  },
]

interface Chapter {
  number: string
  /** A --cat-* palette name. One hue per chapter, so the three read as three. */
  hue: 'indigo' | 'teal' | 'amber'
  eyebrow: string
  title: string
  thesis: string
  items: { icon: ReactNode; name: string; line: string }[]
}

const CHAPTERS: Chapter[] = [
  {
    number: '01',
    hue: 'indigo',
    eyebrow: 'Capture',
    title: 'Get it down in the shape it arrived in',
    thesis:
      'Half of what you want to keep is not a paragraph. It is a list, a file, a half-thought with a name on it.',
    items: [
      {
        icon: <ClipboardList className="h-4 w-4" aria-hidden />,
        name: 'A real editor',
        line: 'Headings, lists, checklists, toggles, inline formatting, and a “/” menu for all of it. Saves as you type.',
      },
      {
        icon: <FolderTree className="h-4 w-4" aria-hidden />,
        name: 'Folders that nest',
        line: 'Notes in folders, folders in folders, dragged into whatever order you think in.',
      },
      {
        icon: <Paperclip className="h-4 w-4" aria-hidden />,
        name: 'Files where the note is',
        line: 'Images, PDFs, Word, spreadsheets, CSVs to 10 MB. Images inline, the rest previewable in place.',
      },
      {
        icon: <Palette className="h-4 w-4" aria-hidden />,
        name: 'Yours to arrange',
        line: 'A colour per note, list cards or tiles, light or dark.',
      },
    ],
  },
  {
    number: '02',
    hue: 'amber',
    eyebrow: 'Commit',
    title: 'A date turns a note into something that keeps score',
    thesis:
      'Most notes apps let you write “Friday” and forget. Give a note a real deadline here and it starts watching the clock for you.',
    items: [
      {
        icon: <CalendarClock className="h-4 w-4" aria-hidden />,
        name: 'Deadlines that count down',
        line: 'Live, against the server’s clock — and it knows finished-early from finished-late.',
      },
      {
        icon: <Bell className="h-4 w-4" aria-hidden />,
        name: 'Reminders by email',
        line: 'At a time, every so many days, or pinned to the deadline. Scheduled in the database, so they fire with the browser shut.',
      },
      {
        icon: <ListTree className="h-4 w-4" aria-hidden />,
        name: 'The whole thing at a glance',
        line: 'Every folder and note with counts, the next deadline coming at you, and one bar for done, waiting and late.',
      },
    ],
  },
  {
    number: '03',
    hue: 'teal',
    eyebrow: 'Return',
    title: 'The test of a notes app is the second visit',
    thesis:
      'Writing it down is the easy half. Everything here exists so that a note you made in March is still findable in September.',
    items: [
      {
        icon: <Search className="h-4 w-4" aria-hidden />,
        name: 'One search box',
        line: 'Titles and note text from anywhere — and the same box runs commands.',
      },
      {
        icon: <SlidersHorizontal className="h-4 w-4" aria-hidden />,
        name: 'Filter from any list',
        line: 'Notes or tasks, overdue or waiting, early or late, by tag — with a live count against each answer before you pick it.',
      },
      {
        icon: <Star className="h-4 w-4" aria-hidden />,
        name: 'Tags, pins and stars',
        line: 'Tag freely, pin what you keep coming back to, star anything to find it on one page.',
      },
      {
        icon: <Smartphone className="h-4 w-4" aria-hidden />,
        name: 'On your phone',
        line: 'Installs to the home screen, and there is an Android build. Everything syncs to your account.',
      },
    ],
  },
]

/**
 * The page, and the element it scrolls in.
 *
 * Split in two on purpose. `html, body, #root { height: 100% }` makes the app a fixed-height shell, so
 * *this* div is the scroller — not the window — and every scroll-driven thing below needs a reference
 * to it. A hook that assumed the window would not throw; it would simply never fire, which is a bug
 * that looks exactly like "the animations were never added".
 */
export function LandingPage() {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={scrollRef}
      id="top"
      /*
       * h-full, not min-h-full — and that one word was the bug.
       *
       * `overflow-y-auto` only makes an element scroll if its height is *capped*. With min-height the
       * div simply grew past #root and the document scrolled instead, so `scrollRef.current.scrollTop`
       * was 0 on every read, forever: the nav never left its resting state and every scroll-driven
       * thing on the page silently did nothing. The hooks are defensive about this now as well, but
       * the honest fix is for the element we hand them to be the one that actually scrolls.
       */
      // landing-hand: the whole page in the app's handwriting, nav and body copy included.
      className="landing-hand h-full overflow-y-auto bg-[var(--color-surface)] text-[var(--color-text)]"
    >
      <ScrollRootProvider elementRef={scrollRef}>
        <LandingContent />
      </ScrollRootProvider>
    </div>
  )
}

/**
 * The two blooms behind the hero, drifting at different rates against the scroll.
 *
 * A component of its own, and that is the whole reason it exists: reading the scroll offset
 * re-renders whoever reads it on every frame, and this used to be read at the root of the page —
 * so a bloom moving two pixels reconciled the carousel, the journey, the deck and every card under
 * them, on a phone, while the finger was still on the glass. Two divs re-render now.
 *
 * The parallax is desktop-only, and `wide` is passed down into the hook rather than only into the
 * transform: on a phone there is nothing to move, so there is nothing to listen for either.
 */
function HeroBlooms({ wide }: { wide: boolean }) {
  const offset = useScrollOffset(wide)

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[36rem] w-[36rem] rounded-full opacity-25 blur-3xl"
        style={{
          background: 'radial-gradient(circle at 50% 50%, #ffffff, transparent 70%)',
          transform: wide ? `translate3d(${offset * 0.06}px, ${offset * 0.16}px, 0)` : undefined,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-40 h-[26rem] w-[26rem] rounded-full opacity-20 blur-3xl"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, var(--landing-hero-glow), transparent 70%)',
          transform: wide ? `translate3d(${offset * -0.05}px, ${offset * 0.28}px, 0)` : undefined,
        }}
      />
    </>
  )
}

/**
 * The deck's tilt as the hero leaves — the same arrangement as HeroBlooms, and for the same reason.
 *
 * The deck itself is passed in as `children` rather than rendered here, which is what keeps it out
 * of the re-render: the element is created by LandingContent, which no longer re-renders on scroll,
 * so React sees the same child on every frame and skips it. Only this wrapper's style changes.
 */
function HeroTilt({ wide, children }: { wide: boolean; children: ReactNode }) {
  const offset = useScrollOffset(wide)

  return (
    <div
      style={
        wide
          ? {
              transform: `perspective(1200px) rotateX(${Math.min(9, offset * 0.02)}deg) translateY(${offset * -0.05}px)`,
              transformOrigin: 'center top',
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

function LandingContent() {
  // The scroll-linked flourishes are for screens with room for them. A parallax bloom and a tilting
  // deck on a 360px viewport are two things moving in a space that has none — and below this width
  // neither one subscribes to the scroll at all.
  const wide = useMediaQuery('(min-width: 1024px)')

  return (
    <>
      <LandingNav />
      <div className="text-[var(--color-text)]">
      {/* The hero is a single tinted field with the wordmark and links sitting straight on it —
          no separate header bar, so the type is the first thing on the page. */}
      <section className="relative overflow-hidden bg-[var(--landing-hero)] text-white">
        {/* Parallax, and only here.
          *
          * Two blooms drifting at different rates against a scroll is the cheapest possible depth cue
          * and the most easily overdone one — so it is used once, on the one section that is a flat
          * field of colour with nothing else to give it dimension. Transform only, so it composites.
          */}
        <HeroBlooms wide={wide} />

        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid items-center gap-8 pb-12 pt-20 sm:gap-10 sm:pb-20 sm:pt-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/90">
                Notes · Deadlines · Shared spaces
              </p>
              <h1
                // A step at 360px as well: 44px with a hard <br /> put "know, stacked" over the edge
                // on the narrowest phones, and the balance keeps the two lines even wherever it lands.
                className="text-[34px] font-extrabold leading-[1.02] tracking-[-0.02em] [text-wrap:balance] min-[380px]:text-[40px] sm:text-[58px] sm:leading-[0.98] lg:text-[72px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Everything you
                <br />
                know, stacked
              </h1>
              {/* Two sentences and a promise. The first says what a note is here, the second says the
                * thing no other notes app on a free tier does — a deadline that is watched by a
                * database rather than by you remembering to open the app. */}
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/85 sm:mt-6 sm:text-[17.5px]">
                A note here holds text, checklists and files, in folders you nest as deep as you
                think. Put a real deadline on one and it starts keeping score — counting down live,
                emailing you before it lands, and remembering afterwards whether you beat it.
              </p>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/70 sm:text-[15px]">
                And when the work is not only yours, a shared space is the same app held by several
                people — with every change recorded against the name of whoever made it.
              </p>

              <Link
                to="/signup"
                className="anim-press mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[12.5px] font-bold uppercase tracking-[0.12em] text-[var(--landing-hero)] transition-transform hover:scale-[1.02] sm:mt-9 sm:px-7 sm:py-3.5 sm:text-[13px] sm:tracking-[0.14em]"
              >
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-4 text-[13px] text-white/70">
                Free. Email and password — no other sign-in providers yet.
              </p>
            </div>

            {/* A deck of notes that deals itself, rather than one static card. One card claims the
                app holds a note; five turning over claim something about the range of things people
                keep in it, without a word of copy. See NoteStack.

                It also tips slightly as the hero leaves — the deck is the one object on the page with
                a physical metaphor already attached, so giving it a little inertia costs nothing and
                sells it. */}
            {/* The tilt is desktop-only. On a phone the hero *is* the screen and the deck is most
                of it, so the same rotation reads as the card stack sliding out of the layout rather
                than as inertia — and `wide` is false there, which leaves it perfectly still. */}
            <HeroTilt wide={wide}>
              <NoteStack />
            </HeroTilt>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Seeing before reading. The chapters below name every part in a line each and show none
            of it; this walks the same ground with a picture of each screen. */}
        <section id="inside" className="py-14 sm:py-20">
          <Reveal from="scale">
            <FeatureCarousel />
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ shared spaces
          *
          * Its own band rather than a row in the chapters below, because it is the one thing here
          * that changes what the app *is* — every other feature makes a personal notebook better,
          * and this one makes it a place two people can stand in. A grid cell would have said
          * "and also, sharing" between a note colour and a search box.
          *
          * The four claims are the four questions anybody sensible asks before putting shared work
          * somewhere: who gets in, what can they do, what happens when they break something, and
          * does this touch my own notes.
          */}
        <section id="spaces" className="border-t border-[var(--color-border)] py-14 sm:py-20">
          <Reveal from="up" className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
            <div className="grid gap-7 p-5 sm:gap-8 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-12">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
                  <Users className="h-3 w-3" aria-hidden />
                  Shared spaces
                </p>
                <h2
                  className="mt-4 text-[26px] font-extrabold leading-[1.08] tracking-tight [text-wrap:balance] sm:text-[36px] lg:text-[40px]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  When the work isn’t only yours
                </h2>
                <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--color-text-muted)]">
                  A shared space is a second workspace with its own tree, notes, deadlines and
                  starred page — everything above, held by several people at once. You step into it
                  and the whole app changes colour, so you always know whose notes you are about to
                  edit. Step out and your own are exactly where you left them.
                </p>

                <ul className="mt-7 grid gap-4 sm:grid-cols-2">
                  {SPACE_CLAIMS.map((claim, index) => (
                    <Reveal as="li" from="left" delay={index * 70} key={claim.title}>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                        {claim.icon}
                      </span>
                      <h3
                        className="mt-2.5 text-[14.5px] font-bold tracking-tight"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {claim.title}
                      </h3>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
                        {claim.body}
                      </p>
                    </Reveal>
                  ))}
                </ul>
              </div>

              <Reveal from="right" delay={120}>
                <SpaceMock />
              </Reveal>
            </div>
          </Reveal>
        </section>

        <JourneySection />

        <section id="everything" className="border-t border-[var(--color-border)] py-14 sm:py-20">
          <Reveal from="blur" className="max-w-2xl">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">
              The whole of it
            </p>
            <h2
              className="mt-2.5 text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[40px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Three chapters, in the order you meet them
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-text-muted)]">
              Not a roadmap and not a pitch deck — every line below is in the app today. Read the
              limits under it before you sign up; they are on the same page for a reason.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {CHAPTERS.map((chapter, chapterIndex) => (
              <Reveal
                as="section"
                from="up"
                delay={chapterIndex * 110}
                key={chapter.number}
                className={cn(
                  'group relative overflow-hidden rounded-3xl border border-[var(--color-border)]',
                  'bg-[var(--color-surface-raised)] p-6 shadow-[var(--shadow-sm)]',
                  'transition-shadow hover:shadow-[var(--shadow-md)]',
                )}
              >
                {/* The numeral as a watermark rather than a label. It orders the three panels at a
                  * glance, from across the room, without taking a line of type to do it — and it is
                  * the one decorative thing on the page that carries information. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-3 -top-8 select-none text-[120px] font-extrabold leading-none opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.12]"
                  style={{ fontFamily: 'var(--font-display)', color: `var(--cat-${chapter.hue})` }}
                >
                  {chapter.number}
                </span>

                <div className="relative">
                  <p
                    className="text-[11px] font-bold uppercase tracking-[0.16em]"
                    style={{ color: `var(--cat-${chapter.hue}-ink)` }}
                  >
                    {chapter.eyebrow}
                  </p>
                  <h3
                    className="mt-2 text-[20px] font-extrabold leading-[1.15] tracking-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {chapter.title}
                  </h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--color-text-muted)]">
                    {chapter.thesis}
                  </p>

                  {/* Hairline-divided rows, not cards inside a card. The chapter is the object here;
                    * its contents are its lines. */}
                  <ul className="mt-5 border-t border-[var(--color-border)]">
                    {chapter.items.map((item) => (
                      <li
                        key={item.name}
                        className="flex gap-3 border-b border-[var(--color-border)] py-3.5 last:border-b-0 last:pb-0"
                      >
                        <span
                          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{
                            background: `var(--cat-${chapter.hue}-soft)`,
                            color: `var(--cat-${chapter.hue}-ink)`,
                          }}
                        >
                          {item.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-bold tracking-tight text-[var(--color-text)]">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
                            {item.line}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] py-14 sm:py-20">
          <h2
            className="text-[30px] font-extrabold tracking-tight sm:text-[38px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Worth knowing first
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--color-text-muted)]">
            The parts a landing page usually leaves out. None of it is a surprise you should find
            after signing up.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {/* The limits of the thing as it stands. Finding these out after signing up would be
                worse than reading them here. */}
            <Plain title="It’s a personal project">
              Built and run by one person, free and as-is. No uptime promise, and database backups
              aren’t set up — keep your own copy of anything you can’t lose. Any note exports as
              Markdown, or prints to PDF from the web app.
            </Plain>
            <Plain title="Nothing is shared unless you share it">
              Your own folders, notes and files belong to your account and are scoped to it in the
              database. A shared space is visible to the people you invite and to nobody else —
              there is no public link, no discovery, no analytics and no advertising.
            </Plain>
            <Plain title="What it doesn’t do">
              No offline editing, no iOS build, and no sign-in with Google or Apple. Reminders
              arrive by email only — no push notifications. Two people editing the same note at the
              same moment will overwrite each other; a space is for shared work, not for typing in
              the same paragraph together. Notes need a connection to load and save.
            </Plain>
            <Plain title="Where it runs">
              Your account, notes and files live with Supabase — Postgres and object storage — on
              servers in Seoul. Reminder emails go over Gmail’s SMTP.
            </Plain>
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] py-14 sm:py-20">
          <div className="flex flex-col items-start gap-5 rounded-3xl bg-[var(--landing-hero)] p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-9">
            <div>
              <h2
                className="text-[24px] font-extrabold tracking-tight sm:text-[30px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Start with one folder
              </h2>
              <p className="mt-1.5 text-[14px] text-white/85">
                Make an account, add a folder, write a note. That’s the whole setup.
              </p>
            </div>
            <Link
              to="/signup"
              className="anim-press inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--landing-hero)] transition-transform hover:scale-[1.02]"
            >
              Create account
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--color-border)] py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 text-[13px] text-[var(--color-text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="flex items-center gap-2 font-bold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>
            <ProjectLogo className="h-3.5 w-[19px] text-[var(--color-accent)]" />
            Mindstack
          </span>
          <nav className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-[var(--color-text)] hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-[var(--color-text)] hover:underline">
              Terms
            </Link>
            <Link to="/login" className="hover:text-[var(--color-text)] hover:underline">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
      </div>
    </>
  )
}


/**
 * A space, as its own screen shows it: who is in it, and what they have been doing.
 *
 * The activity rows are the half that sells it. "Several people can edit this" is a promise anybody
 * can make; "and here is the line that says Priya deleted it at 12:04" is the reason somebody would
 * trust shared work to it.
 */
function SpaceMock() {
  return (
    <div className="min-w-0" aria-hidden>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
            style={{ background: 'var(--cat-teal)' }}
          >
            AE
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold text-[var(--color-text)]">
              Team of Aeres
            </span>
            <span className="block text-[11px] text-[var(--color-text-muted)]">
              Owner &middot; 3 people
            </span>
          </span>
          {/* The space's own colour, which is what tints the app while you are inside it. */}
          <span className="flex shrink-0 gap-1">
            {['teal', 'indigo', 'amber'].map((hue, index) => (
              <span
                key={hue}
                className={cn(
                  'h-4 w-4 rounded-full',
                  index === 0 && 'ring-2 ring-[var(--color-text)] ring-offset-2 ring-offset-[var(--color-surface)]',
                )}
                style={{ background: `var(--cat-${hue})` }}
              />
            ))}
          </span>
        </div>

        <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Editors 2
          </p>
          {[
            { email: 'priya@studio.co', role: 'Editor' },
            { email: 'sam@studio.co', role: 'Viewer' },
          ].map((member) => (
            <div key={member.email} className="flex items-center gap-2">
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))' }}
              >
                {member.email.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text)]">
                {member.email}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--color-hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                {member.role}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            Activity
          </p>
          {[
            { who: 'Priya', did: 'deleted a note', what: 'Old brief', when: '12:04' },
            { who: 'Sam', did: 'moved a folder', what: 'Q3 → Archive', when: '11:47' },
            { who: 'You', did: 'added a note', what: 'Launch copy', when: '09:12' },
          ].map((row) => (
            <div key={row.what} className="flex items-center gap-1.5">
              <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-text)]">
                {row.who}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent-ink)]">
                {row.did}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-text-muted)]">
                {row.what}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)]">
                {row.when}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Plain({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] p-5">
      <h3 className="text-[16px] font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
        {title}
      </h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-text-muted)]">{children}</p>
    </div>
  )
}
