import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardList,
  FolderTree,
  ListTree,
  Moon,
  Palette,
  Paperclip,
  Search,
  Smartphone,
  Star,
  Sun,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTheme } from '../hooks/useTheme'
import { originFromElement } from '../lib/themeReveal'
import { ProjectLogo } from '../components/brand/ProjectLogo'
import { cn } from '../lib/cn'

/**
 * Everything on this page is something the app actually does today. No roadmap items, no
 * capabilities it doesn't have (there's no sharing, no collaboration, no offline editing), and no
 * claims about scale or security beyond what the code and the Supabase project really provide.
 */
const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <FolderTree className="h-4 w-4" aria-hidden />,
    title: 'Folders that nest',
    body: 'Notes in folders, folders in folders. Drag to reorder, and open any folder as a list or a board split by its subfolders.',
  },
  {
    icon: <ClipboardList className="h-4 w-4" aria-hidden />,
    title: 'A real editor',
    body: 'Headings, lists, checklists, toggles and inline formatting, with a “/” menu for everything. Notes save themselves as you type.',
  },
  {
    icon: <Paperclip className="h-4 w-4" aria-hidden />,
    title: 'Files where the note is',
    body: 'Images, PDFs, Word files, spreadsheets and CSVs up to 10 MB. Images show inline; the rest sit in a bar at the bottom of the note, previewable in place.',
  },
  {
    icon: <CalendarClock className="h-4 w-4" aria-hidden />,
    title: 'Due dates and reminders',
    body: 'Give a note a due date and a status, and get an email before it lands — timed to your own clock.',
  },
  {
    icon: <Star className="h-4 w-4" aria-hidden />,
    title: 'Tags, pins and stars',
    body: 'Tag freely, pin what you keep returning to, star anything to find it on the Important page.',
  },
  {
    icon: <Search className="h-4 w-4" aria-hidden />,
    title: 'One search box',
    body: 'Search titles and note text from anywhere, or run a command from the same box.',
  },
  {
    icon: <ListTree className="h-4 w-4" aria-hidden />,
    title: 'The whole thing at a glance',
    body: 'A tree of every folder and note, with counts, so you can see the shape of what you have.',
  },
  {
    icon: <Palette className="h-4 w-4" aria-hidden />,
    title: 'Yours to arrange',
    body: 'A colour per note, list cards or colourful tiles, light or dark.',
  },
  {
    icon: <Smartphone className="h-4 w-4" aria-hidden />,
    title: 'On your phone',
    body: 'The same app installs to your home screen, and there’s an Android build. Everything syncs to your account.',
  },
]

export function LandingPage() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="min-h-full overflow-y-auto bg-[var(--color-surface)] text-[var(--color-text)]">
      {/* The hero is a single tinted field with the wordmark and links sitting straight on it —
          no separate header bar, so the type is the first thing on the page. */}
      <section className="relative overflow-hidden bg-[var(--color-accent)] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[36rem] w-[36rem] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle at 50% 50%, #ffffff, transparent 70%)' }}
        />

        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <nav className="flex items-center gap-3 py-6">
            {/* On the accent field the mark inherits white from the nav, so no light/dark variant
                of the asset is needed. */}
            <span className="mr-auto flex items-center gap-2.5">
              <ProjectLogo className="h-5 w-[27px] text-white" />
              <span
                className="text-[22px] font-extrabold tracking-tight sm:text-[24px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Mindstack
              </span>
            </span>
            <button
              type="button"
              onClick={(event) => toggleTheme(originFromElement(event.currentTarget))}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="anim-press inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            </button>
            <Link
              to="/login"
              className="anim-press rounded-full px-3.5 py-2 text-[14px] font-semibold text-white/90 transition-colors hover:bg-white/15 hover:text-white"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="anim-press rounded-full bg-white px-4 py-2 text-[14px] font-bold text-[var(--color-accent)] transition-transform hover:scale-[1.02]"
            >
              Create account
            </Link>
          </nav>

          <div className="grid items-center gap-10 pb-14 pt-6 sm:pb-20 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <h1
                className="text-[44px] font-extrabold leading-[0.98] tracking-[-0.02em] sm:text-[64px] lg:text-[72px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Everything you
                <br />
                know, stacked
              </h1>
              <p className="mt-6 max-w-md text-[16px] leading-relaxed text-white/85 sm:text-[17.5px]">
                Notes that hold text, checklists and files. Folders you arrange yourself. Reminders
                when something is due. It syncs to your account and follows you to your phone.
              </p>

              <Link
                to="/signup"
                className="anim-press mt-9 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)] transition-transform hover:scale-[1.02]"
              >
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-4 text-[13px] text-white/70">
                Free. Email and password — no other sign-in providers yet.
              </p>
            </div>

            {/* An illustration of the app's own furniture, not a screenshot: a note the way the
                editor really shows one — title, tag, checklist, due date, a file at the bottom. */}
            <NotePreview />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="py-14 sm:py-20">
          <h2
            className="text-[30px] font-extrabold tracking-tight sm:text-[38px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            What’s in it
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className={cn(
                  'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5',
                  'shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]',
                )}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                  {feature.icon}
                </span>
                <h3
                  className="mt-4 text-[17px] font-bold tracking-tight"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {feature.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-text-muted)]">{feature.body}</p>
              </article>
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
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {/* The limits of the thing as it stands. Finding these out after signing up would be
                worse than reading them here. */}
            <Plain title="It’s a personal project">
              Built and run by one person, free and as-is. No uptime promise, and database backups
              aren’t set up — keep your own copy of anything you can’t lose. Any note exports as
              Markdown, or prints to PDF from the web app.
            </Plain>
            <Plain title="Only you can read your notes">
              Every folder, note and file belongs to your account and is scoped to it in the
              database. Nothing is public or shared, and there’s no analytics or advertising.
            </Plain>
            <Plain title="What it doesn’t do">
              No sharing or collaboration, no offline editing, no iOS build, and no sign-in with
              Google or Apple. Notes need a connection to load and save.
            </Plain>
            <Plain title="Where it runs">
              Your account, notes and files live with Supabase — Postgres and object storage — on
              servers in Seoul. Reminder emails go over Gmail’s SMTP.
            </Plain>
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] py-14 sm:py-20">
          <div className="flex flex-col items-start gap-5 rounded-3xl bg-[var(--color-accent)] p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-9">
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
              className="anim-press inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)] transition-transform hover:scale-[1.02]"
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
  )
}

function NotePreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0">
      <div className="rounded-3xl bg-[var(--color-surface)] p-5 text-[var(--color-text)] shadow-[var(--shadow-lg)]">
        <p className="text-[11.5px] text-[var(--color-text-muted)]">Notes → Job Applied</p>
        <div className="mt-2 flex items-center gap-2">
          <h3 className="text-[20px] font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Interview prep
          </h3>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-accent)]">
            <CalendarClock className="h-2.5 w-2.5" aria-hidden />
            Fri, 9:00
          </span>
        </div>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-full bg-[var(--color-hover)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-text-muted)]">
            # career
          </span>
          <span className="rounded-full bg-[var(--cat-emerald-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--cat-emerald-ink)]">
            Ongoing
          </span>
        </div>

        <div className="mt-4 space-y-2.5 border-t border-[var(--color-border)] pt-4 text-[13.5px]">
          <p className="text-[var(--color-text-muted)]">Three questions to have ready:</p>
          {['Walk through the folder sync design', 'Where reminders are scheduled', 'What I’d do differently'].map(
            (line, index) => (
              <p key={line} className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
                    index === 0
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                      : 'border-[var(--color-border-strong)]',
                  )}
                  aria-hidden
                >
                  {index === 0 ? <Check className="h-2.5 w-2.5" aria-hidden /> : null}
                </span>
                <span className={index === 0 ? 'text-[var(--color-text-muted)] line-through' : undefined}>{line}</span>
              </p>
            ),
          )}
        </div>

        <div className="mt-4 flex gap-2 border-t border-[var(--color-border)] pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text)]">
            <Paperclip className="h-3 w-3" aria-hidden />
            resume.pdf
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text)]">
            <Paperclip className="h-3 w-3" aria-hidden />
            notes.docx
          </span>
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
