import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Command,
  FileText,
  FolderTree,
  History,
  Image as ImageIcon,
  LayoutGrid,
  ListTree,
  Moon,
  Palette,
  Paperclip,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Star,
  Sun,
  Timer,
  UserPlus,
  Users,
} from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * The whole app in one pass, one idea per slide.
 *
 * The grid below this is a list of names and paragraphs; it tells you what exists and shows you
 * none of it. So this is the seeing half — a small working picture of each part, drawn with the
 * app's own pills, colours, spacing and the same radiating marker the Tree really uses, rather
 * than screenshots that would go stale the first time a card changed shape.
 *
 * Everything claimed here is something the app does today; the page's own note at the top of
 * LandingPage is the rule, and this is held to it.
 *
 * Built on scroll-snap rather than a transform: swiping is then the browser's own gesture with
 * the browser's own momentum, the arrows are one scrollTo, and the whole thing degrades to a
 * plain horizontal scroller if the script never runs.
 */

interface Slide {
  key: string
  icon: ReactNode
  /**
   * Two words, for the tab row.
   *
   * Separate from `eyebrow`, which is a sentence — "Counted against the server, not your device"
   * says the right thing inside a slide and is useless as a tab. Eleven anonymous dots said nothing
   * at all; eleven names say what the whole set contains before you turn any of it.
   */
  tab: string
  eyebrow: string
  title: string
  body: string
  points: string[]
  mock: ReactNode
}

/** The frame every mock sits in — a scrap of app surface, laid on the slide. */
function Mock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)]',
        className,
      )}
      aria-hidden
    >
      {children}
    </div>
  )
}

function MockLabel({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
      {children}
    </p>
  )
}

function StatePill({
  tone,
  children,
}: {
  tone: 'slate' | 'danger' | 'emerald' | 'amber'
  children: string
}) {
  const styles: Record<typeof tone, CSSProperties> = {
    slate: { background: 'var(--task-slate-card)', color: 'var(--task-slate-ink)' },
    danger: {
      background: 'color-mix(in srgb, var(--color-danger) 14%, transparent)',
      color: 'var(--color-danger)',
    },
    emerald: { background: 'var(--cat-emerald-soft)', color: 'var(--cat-emerald-ink)' },
    amber: { background: 'var(--task-amber-card)', color: 'var(--task-amber-ink)' },
  }
  const icons = { slate: Clock, danger: AlarmClock, emerald: CheckCircle2, amber: CheckCircle2 }
  const Icon = icons[tone]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={styles[tone]}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </span>
  )
}

function FileChip({ icon: Icon, name }: { icon: typeof Paperclip; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text)]">
      <Icon className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      {name}
    </span>
  )
}

const SLIDES: Slide[] = [
  {
    key: 'folders',
    icon: <FolderTree className="h-4 w-4" aria-hidden />,
    tab: 'Folders',
    eyebrow: 'Where everything lives',
    title: 'Folders inside folders, arranged by you',
    body: 'Notes go in folders, folders go in folders, as deep as you like. Drag to reorder anything, and open a folder either as a plain list or as a board split into columns by its subfolders.',
    points: [
      'Each folder says how much is inside it, and flags what is running late.',
      'Nothing is sorted for you — the order is the one you put things in.',
    ],
    mock: (
      <Mock className="space-y-1.5">
        {[
          {
            name: 'Job Tracking',
            meta: '3 subfolders · 12 notes',
            cat: 'indigo',
            depth: 0,
            overdue: '2 overdue',
          },
          { name: 'Applied', meta: '8 notes', cat: 'indigo', depth: 1, overdue: null },
          { name: 'Interviews', meta: '4 notes', cat: 'indigo', depth: 1, overdue: null },
          { name: 'Learning', meta: '1 subfolder · 9 notes', cat: 'teal', depth: 0, overdue: null },
        ].map((row) => (
          <div
            key={row.name}
            className="flex items-center gap-2.5"
            style={{ paddingLeft: row.depth * 16 }}
          >
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `var(--cat-${row.cat}-soft)`, color: `var(--cat-${row.cat})` }}
            >
              <FolderTree className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-[var(--color-text)]">
                {row.name}
              </span>
              <span className="block truncate text-[10.5px] text-[var(--color-text-muted)]">
                {row.meta}
              </span>
            </span>
            {row.overdue ? (
              <span
                className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold"
                style={{
                  background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                  color: 'var(--color-danger)',
                }}
              >
                {row.overdue}
              </span>
            ) : null}
          </div>
        ))}
      </Mock>
    ),
  },
  {
    key: 'editor',
    icon: <Pencil className="h-4 w-4" aria-hidden />,
    tab: 'Editor',
    eyebrow: 'The note itself',
    title: 'A block editor, not a text box',
    body: 'Headings, bullet and numbered lists, checklists, collapsible toggles and inline formatting — with a “/” menu that reaches all of it without leaving the keyboard. Notes save themselves as you type.',
    points: [
      'A checklist inside a note is separate from the note’s own done state.',
      'Any note exports as Markdown, or prints to PDF from the web app.',
    ],
    mock: (
      <Mock className="space-y-2.5">
        <p
          className="text-[15px] font-extrabold tracking-tight text-[var(--color-text)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Interview prep
        </p>
        <p className="text-[12px] text-[var(--color-text-muted)]">Three questions to have ready:</p>
        {[
          { text: 'Walk through the folder sync design', done: true },
          { text: 'Where reminders are scheduled', done: false },
        ].map((line) => (
          <p key={line.text} className="flex items-start gap-2 text-[12px]">
            <span
              className={cn(
                'mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
                line.done
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                  : 'border-[var(--color-border-strong)]',
              )}
            >
              {line.done ? <Check className="h-2.5 w-2.5" aria-hidden /> : null}
            </span>
            <span
              className={line.done ? 'text-[var(--color-text-muted)] line-through' : 'text-[var(--color-text)]'}
            >
              {line.text}
            </span>
          </p>
        ))}
        <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          Things to avoid
        </p>
        <p className="flex items-center gap-2 rounded-lg bg-[var(--color-hover)] px-2 py-1.5 text-[11.5px] text-[var(--color-text-muted)]">
          <span className="rounded border border-[var(--color-border-strong)] px-1 font-mono text-[10px]">
            /
          </span>
          heading, list, checklist, toggle…
        </p>
      </Mock>
    ),
  },
  {
    key: 'files',
    icon: <Paperclip className="h-4 w-4" aria-hidden />,
    tab: 'Files',
    eyebrow: 'Attachments',
    title: 'Files sit in the note they belong to',
    body: 'Images, PDFs, Word documents, spreadsheets and CSVs, up to 10 MB each. Pictures show inline; everything else waits in a bar at the foot of the note and previews there without downloading.',
    points: [
      'Spreadsheets and CSVs open as a table, PDFs page through in place.',
      'Images can be collapsed to their filenames when a note gets long.',
    ],
    mock: (
      <Mock className="space-y-3">
        <div
          className="flex h-20 items-center justify-center rounded-xl"
          style={{
            background:
              'linear-gradient(135deg, var(--cat-indigo-soft), var(--cat-teal-soft))',
          }}
        >
          <ImageIcon className="h-6 w-6 text-[var(--color-text-muted)]" aria-hidden />
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] pt-3">
          <FileChip icon={Paperclip} name="resume.pdf" />
          <FileChip icon={Paperclip} name="notes.docx" />
          <FileChip icon={Paperclip} name="budget.xlsx" />
        </div>
      </Mock>
    ),
  },
  {
    key: 'deadlines',
    icon: <CalendarClock className="h-4 w-4" aria-hidden />,
    tab: 'Tasks',
    eyebrow: 'Notes and tasks',
    title: 'A note becomes a task when you say so',
    body: 'One switch turns a note into something with a deadline, a countdown and a status. The status is worked out from the deadline, the tick and the clock — never chosen from a menu — and the server stamps the moment you tick it off.',
    points: [
      'So “done” and “done two days late” stay different facts, not the same tick.',
      'Un-ticking a finished task asks first, and offers to move the deadline forward.',
    ],
    mock: (
      <Mock className="space-y-3">
        <MockLabel>Schedule</MockLabel>
        <div className="flex gap-1 rounded-xl bg-[var(--color-hover)] p-1">
          <span className="flex-1 rounded-lg px-2 py-1.5 text-center text-[12px] font-semibold text-[var(--color-text-muted)]">
            Normal note
          </span>
          <span className="flex-1 rounded-lg bg-[var(--color-surface)] px-2 py-1.5 text-center text-[12px] font-semibold text-[var(--color-text)] shadow-[var(--shadow-sm)]">
            Due-date task
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-border)] pt-3">
          <StatePill tone="slate">Not due yet</StatePill>
          <StatePill tone="danger">Overdue</StatePill>
          <StatePill tone="emerald">Completed on time</StatePill>
          <StatePill tone="amber">Completed late</StatePill>
        </div>
      </Mock>
    ),
  },
  {
    key: 'countdown',
    icon: <Timer className="h-4 w-4" aria-hidden />,
    tab: 'Deadlines',
    eyebrow: 'Counted against the server, not your device',
    title: 'A deadline that keeps counting',
    body: 'Every task carries a live countdown that ticks down to the minute, then the second in the last hour, then rolls over to “Overdue by…”. It runs off the server’s clock, so a laptop that slept through a deadline wakes up telling the truth.',
    points: [
      'Nothing needs reloading for a task to become overdue while you read it.',
      'Seconds show only in the last hour, and the minute either side just reads “Due now”.',
    ],
    mock: (
      <Mock className="space-y-2">
        <div className="flex items-center gap-2 rounded-xl bg-[var(--task-slate-card)] px-3 py-2">
          <Clock
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--task-slate-ink)' }}
            aria-hidden
          />
          <span
            className="text-[12.5px] font-semibold tabular-nums"
            style={{ color: 'var(--task-slate-ink)' }}
          >
            1d 4h 12m remaining
          </span>
        </div>
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)' }}
        >
          <AlarmClock
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--color-danger)' }}
            aria-hidden
          />
          <span
            className="text-[12.5px] font-semibold tabular-nums"
            style={{ color: 'var(--color-danger)' }}
          >
            Overdue by 2h 15m
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-[var(--cat-emerald-soft)] px-3 py-2">
          <Check
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--cat-emerald-ink)' }}
            aria-hidden
          />
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--cat-emerald-ink)' }}>
            Completed on time
          </span>
        </div>
      </Mock>
    ),
  },
  {
    key: 'reminders',
    icon: <Bell className="h-4 w-4" aria-hidden />,
    tab: 'Reminders',
    eyebrow: 'Email, scheduled server-side',
    title: 'Reminders in three shapes',
    body: 'One at an exact time, one that repeats every so many days or weeks, or one pinned to the deadline itself — an hour before, a day after. A task can carry any number of them, firing independently.',
    points: [
      'Each keeps the timezone you set it in, so 9:00 stays 9:00 after you travel.',
      'The next run is worked out in the database, so it fires with every browser shut.',
    ],
    mock: (
      <Mock className="space-y-1.5">
        {[
          { line: '1 day before the deadline', meta: 'Runs Thu 09:00' },
          { line: 'Every Monday at 09:00', meta: 'Runs in 3 days' },
          { line: '2 hours after the deadline', meta: 'Nudge if still open' },
        ].map((item) => (
          <div
            key={item.line}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-2.5 py-2"
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <Bell className="h-3 w-3" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold text-[var(--color-text)]">
                {item.line}
              </span>
              <span className="block truncate text-[10.5px] text-[var(--color-text-muted)]">
                {item.meta}
              </span>
            </span>
          </div>
        ))}
      </Mock>
    ),
  },
  {
    key: 'filter',
    icon: <SlidersHorizontal className="h-4 w-4" aria-hidden />,
    tab: 'Filters',
    eyebrow: 'The same control everywhere',
    title: 'Ask what’s overdue, from any list',
    body: 'One pill on every listing — inside a folder, across all tasks, in Starred, on the Tree. Narrow by what a note is, by where its deadline got to, and by tag, with a live count against each answer.',
    points: [
      '“Completed on time” and “Completed late” are separate answers, not one bucket.',
      'The count beside each option tells you what you’d be left with before you pick it.',
    ],
    mock: (
      <Mock className="space-y-0.5">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-1.5">
          <span className="text-[11.5px] font-semibold text-[var(--color-text)]">Filter</span>
          <span className="text-[11px] font-semibold text-[var(--color-accent)]">Reset</span>
        </div>
        {[
          { label: 'Any status', count: '24', dot: null, indent: false, active: false },
          { label: 'Incomplete', count: '9', dot: 'var(--color-text-muted)', indent: false, active: false },
          { label: 'Overdue', count: '3', dot: 'var(--color-danger)', indent: true, active: true },
          { label: 'Completed on time', count: '12', dot: 'var(--cat-emerald)', indent: true, active: false },
          { label: 'Completed late', count: '3', dot: 'var(--task-amber-solid)', indent: true, active: false },
        ].map((row) => (
          <div
            key={row.label}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]',
              row.indent && 'pl-5',
              row.active
                ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)]',
            )}
          >
            {row.dot ? (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.dot }} />
            ) : (
              <span className="h-2 w-2 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <span className="tabular-nums opacity-70">{row.count}</span>
            {row.active ? <Check className="h-3 w-3 shrink-0" aria-hidden /> : null}
          </div>
        ))}
      </Mock>
    ),
  },
  {
    key: 'tree',
    icon: <ListTree className="h-4 w-4" aria-hidden />,
    tab: 'Tree',
    eyebrow: 'The whole workspace on one screen',
    title: 'The Tree, and the deadline that’s next',
    body: 'Counts for everything you have, the shape of the folder tree underneath, and at the top the nearest unfinished deadline — pulsing harder the closer it is, and a tap away from the note itself.',
    points: [
      'Under it, every tracked task as one bar: overdue, waiting, on time, late.',
      'The stat cards are shortcuts: tap “Overdue” and the list below filters to it.',
    ],
    mock: (
      <Mock className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className="anim-radiate inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={
              {
                background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)',
                color: 'var(--color-danger)',
                '--radiate-period': '1600ms',
              } as CSSProperties
            }
          >
            <AlarmClock className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ color: 'var(--color-danger)' }}
            >
              Overdue — finish this
            </span>
            <span className="block truncate text-[13.5px] font-semibold text-[var(--color-text)]">
              Send the Oracle follow-up
            </span>
          </span>
          <span
            className="shrink-0 text-[12px] font-bold tabular-nums"
            style={{ color: 'var(--color-danger)' }}
          >
            2h 15m
          </span>
        </div>

        <div className="border-t border-[var(--color-border)] pt-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] font-semibold text-[var(--color-text)]">
              Deadline health
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)]">
              <span className="font-semibold text-[var(--color-text)]">62%</span> of 24 done
            </span>
          </div>
          <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-[var(--color-hover)]">
            <span className="h-full w-[12%] rounded-full" style={{ background: 'var(--color-danger)' }} />
            <span className="h-full w-[26%] rounded-full" style={{ background: 'var(--task-slate-solid)' }} />
            <span className="h-full w-[50%] rounded-full" style={{ background: 'var(--cat-emerald)' }} />
            <span className="h-full w-[12%] rounded-full" style={{ background: 'var(--task-amber-solid)' }} />
          </div>
        </div>
      </Mock>
    ),
  },
  {
    key: 'find',
    icon: <Search className="h-4 w-4" aria-hidden />,
    tab: 'Search',
    eyebrow: 'One box',
    title: 'Find it, or just do it',
    body: 'Search runs over folder names, note titles, the text inside notes and checklist items, from wherever you are. The same box takes commands, so the thing you were about to click is often quicker to type.',
    points: [
      'Results say where each hit lives, so two notes with one name stay apart.',
      'Tag and pin freely — and everything you star lands together on one page.',
    ],
    mock: (
      <Mock className="space-y-2">
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
          <span className="text-[12.5px] text-[var(--color-text)]">interview</span>
        </div>
        {[
          { icon: FileText, name: 'Interview prep', path: 'Notes › Job Tracking' },
          { icon: FileText, name: 'Interview questions', path: 'Notes › Learning' },
        ].map((row) => (
          <div key={row.name} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
            <row.icon className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text)]">
              {row.name}
            </span>
            <span className="shrink-0 truncate text-[10.5px] text-[var(--color-text-muted)]">
              {row.path}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-lg bg-[var(--color-accent-soft)] px-1.5 py-1">
          <Command className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--color-accent)]">
            New note
          </span>
          <Star className="h-3 w-3 shrink-0 fill-current text-[var(--cat-rose)]" aria-hidden />
        </div>
      </Mock>
    ),
  },
  {
    key: 'history',
    icon: <History className="h-4 w-4" aria-hidden />,
    tab: 'History',
    eyebrow: 'Written by the database, not by you',
    title: 'Every deadline a task has ever had',
    body: 'A column only ever holds the present. When a deadline moved, whether that email actually went out, when you ticked it off and when you reopened it — each is recorded as it happens, on a log nothing can edit after the fact.',
    points: [
      'Moving a deadline records what it was as well as what it became.',
      'A reminder’s wording is kept with the entry, so history still reads after you delete it.',
    ],
    mock: (
      <Mock className="space-y-2">
        {[
          { icon: RotateCcw, label: 'Reopened', meta: 'Today, 10:04' },
          { icon: CheckCircle2, label: 'Completed', meta: 'Yesterday, 18:20' },
          { icon: Bell, label: 'Reminder sent — 1 day before', meta: 'Mon, 09:00' },
          { icon: CalendarClock, label: 'Deadline moved · Fri 09:00 → Tue 17:00', meta: 'Sun, 21:11' },
        ].map((row) => (
          <div key={row.label} className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-hover)] text-[var(--color-text-muted)]">
              <row.icon className="h-2.5 w-2.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-medium text-[var(--color-text)]">
                {row.label}
              </span>
              <span className="block text-[10.5px] text-[var(--color-text-muted)]">{row.meta}</span>
            </span>
          </div>
        ))}
      </Mock>
    ),
  },
  {
    key: 'spaces',
    icon: <Users className="h-4 w-4" aria-hidden />,
    tab: 'Shared',
    eyebrow: 'A second kind of workspace',
    title: 'The same app, held by several people',
    body: 'A shared space has its own tree, its own notes and its own deadlines, and everyone invited works in them together. Your own notes stay exactly where they were — a space is somewhere you go, not something that happens to them.',
    points: [
      'Invited by email, and redeemable only by that address: a forwarded link admits nobody.',
      'Owner, admin, editor and viewer — enforced by the database rather than by which buttons are drawn.',
      'Every change recorded as it happens, with who made it and what it was before.',
    ],
    mock: (
      <Mock className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
            style={{ background: 'var(--cat-teal)' }}
            aria-hidden
          >
            AE
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-bold text-[var(--color-text)]">
              Team of Aeres
            </span>
            <span className="block text-[10.5px] text-[var(--color-text-muted)]">
              Owner &middot; 3 people
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
            <UserPlus className="h-2.5 w-2.5" aria-hidden />
            Invite
          </span>
        </div>

        <div className="space-y-1.5 border-t border-[var(--color-border)] pt-2.5">
          <MockLabel>Editors 2</MockLabel>
          {['priya@studio.co', 'sam@studio.co'].map((email) => (
            <div key={email} className="flex items-center gap-2">
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))' }}
                aria-hidden
              >
                {email.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-text)]">
                {email}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--color-hover)] px-1.5 text-[9.5px] font-semibold text-[var(--color-text-muted)]">
                Editor
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 border-t border-[var(--color-border)] pt-2.5">
          <MockLabel>Activity</MockLabel>
          {[
            { who: 'Priya', did: 'deleted a note', what: 'Old brief', when: '12:04' },
            { who: 'Sam', did: 'moved a folder', what: 'Q3 → Archive', when: '11:47' },
          ].map((row) => (
            <div key={row.what} className="flex items-center gap-1.5">
              <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-1.5 text-[9.5px] font-bold text-[var(--color-text)]">
                {row.who}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--color-accent-soft)] px-1.5 text-[9.5px] font-semibold text-[var(--color-accent-ink)]">
                {row.did}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--color-text-muted)]">
                {row.what}
              </span>
              <span className="shrink-0 text-[9.5px] tabular-nums text-[var(--color-text-muted)]">
                {row.when}
              </span>
            </div>
          ))}
        </div>
      </Mock>
    ),
  },
  {
    key: 'yours',
    icon: <Palette className="h-4 w-4" aria-hidden />,
    tab: 'Yours',
    eyebrow: 'Set it up how you like',
    title: 'Your colours, your layout, your phone',
    body: 'A colour per note or a whole palette left to the app. Notes as list cards or as colourful tiles you can drag and resize. Light or dark. All of it saved to your account and waiting on the next device.',
    points: [
      'How many cards fit in a row is set per screen size, so a phone keeps its own.',
      'Installs to a home screen from the browser, and there’s an Android build.',
    ],
    mock: (
      <Mock className="space-y-3">
        <div>
          <MockLabel>Note colour</MockLabel>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {['indigo', 'teal', 'amber', 'rose', 'emerald', 'violet', 'blue', 'pink'].map((name) => (
              <span
                key={name}
                className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/5"
                style={{ background: `var(--task-${name}-card)` }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
          <span className="inline-flex gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] p-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text)] shadow-[var(--shadow-sm)]">
              <ListTree className="h-3 w-3" aria-hidden />
              List
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-[var(--color-text-muted)]">
              <LayoutGrid className="h-3 w-3" aria-hidden />
              Tiles
            </span>
          </span>
          <span className="inline-flex gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] p-0.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]">
              <Sun className="h-3 w-3" aria-hidden />
            </span>
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-text-muted)]">
              <Moon className="h-3 w-3" aria-hidden />
            </span>
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-muted)]">
            <Smartphone className="h-3 w-3" aria-hidden />
            Syncs to your account
          </span>
        </div>
      </Mock>
    ),
  },
]

/** How long a slide holds before the track moves on by itself. */
const AUTOPLAY_MS = 3000

export function FeatureCarousel() {
  const trackRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  /**
   * Held still while a pointer is over the track or something inside it has focus.
   *
   * Three seconds is barely long enough to read a slide, so the moment someone is plainly reading
   * one it has to stop moving — and start again on its own when they leave, rather than sitting
   * dead for the rest of the visit. Pointer events cover the touch case for free: a finger down
   * to swipe is an enter, lifting it is a leave, so the track never fights the gesture.
   */
  const [paused, setPaused] = useState(false)
  /**
   * Bumped by every arrow, dot and arrow-key press, purely to restart the timer.
   *
   * Without it, moving a slide by hand could be followed a tenth of a second later by the timer
   * moving it again — you would land on the slide after the one you asked for.
   */
  const [restartKey, setRestartKey] = useState(0)

  const goTo = useCallback((next: number) => {
    const track = trackRef.current
    if (!track) {
      return
    }
    const wrapped = (next + SLIDES.length) % SLIDES.length
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    track.scrollTo({ left: wrapped * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' })
    setRestartKey((key) => key + 1)
  }, [])

  /*
   * Keep the active tab in view, by moving this row's own scrollLeft.
   *
   * Deliberately not scrollIntoView. `block: 'nearest'` scrolls whatever ancestor it has to in the
   * vertical axis as well — and on first paint this whole section is below the fold, so asking for
   * tab one would have hauled the page down to the carousel before the visitor had read the hero.
   * Setting scrollLeft on the row cannot move anything but the row.
   *
   * Only nudged when the tab is actually outside, so a tab already on screen is left where it is
   * rather than being centred on every advance.
   */
  useEffect(() => {
    const tabs = tabsRef.current
    const active = tabs?.querySelector<HTMLElement>('[data-active]')
    if (!tabs || !active) {
      return
    }
    const left = active.offsetLeft
    const right = left + active.offsetWidth
    const margin = 12
    if (left < tabs.scrollLeft + margin) {
      tabs.scrollTo({ left: Math.max(0, left - margin), behavior: 'smooth' })
    } else if (right > tabs.scrollLeft + tabs.clientWidth - margin) {
      tabs.scrollTo({ left: right - tabs.clientWidth + margin, behavior: 'smooth' })
    }
  }, [index])

  // The active tab follows the scroll position rather than the button that caused it, so a swipe
  // and an arrow report the same thing and a half-finished drag can't desynchronise them.
  useEffect(() => {
    const track = trackRef.current
    if (!track) {
      return
    }
    const onScroll = () => {
      const width = track.clientWidth
      if (width > 0) {
        setIndex(Math.round(track.scrollLeft / width))
      }
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => track.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    const timer = window.setInterval(() => {
      const track = trackRef.current
      if (!track || track.clientWidth === 0 || document.hidden) {
        return
      }
      // Read the position off the track rather than off `index`: a swipe left mid-flight is the
      // truth about where we are, and this effect does not re-run for it.
      const current = Math.round(track.scrollLeft / track.clientWidth)
      track.scrollTo({
        left: ((current + 1) % SLIDES.length) * track.clientWidth,
        behavior: 'smooth',
      })
    }, AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [paused, restartKey])

  return (
    <section
      aria-roledescription="carousel"
      aria-label="A look inside the app"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      // Capture, so focus landing on any arrow, dot or slide counts; relatedTarget tells the two
      // apart from focus simply moving between two children, which should not restart anything.
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          goTo(index + 1)
        }
        if (event.key === 'ArrowLeft') {
          goTo(index - 1)
        }
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-accent)]">
            A look inside
          </p>
          <h2
            className="mt-1.5 text-[30px] font-extrabold tracking-tight sm:text-[38px]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            What you actually get
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-[12.5px] font-medium tabular-nums text-[var(--color-text-muted)]">
            {index + 1} / {SLIDES.length}
          </span>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => goTo(index - 1)}
            className="anim-press inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => goTo(index + 1)}
            className="anim-press inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/*
        * How long this slide has left.
        *
        * Auto-advancing without it is a carousel that moves for no visible reason, which reads as a
        * fault the first time and as an annoyance after that. A line that is plainly running down
        * makes the same movement expected — and because it stops dead when the deck pauses under a
        * pointer, it also *shows* that reading a slide holds it, which nothing else on screen did.
        *
        * Keyed on the slide and the restart counter so the CSS animation begins again from zero on
        * every move, by hand or by timer: a remount is the only way to restart a keyframe animation
        * that has already run.
        */}
      <div className="mt-6 h-[3px] overflow-hidden rounded-full bg-[var(--color-border)]">
        <div
          key={`${index}-${restartKey}`}
          className="anim-carousel-dwell h-full rounded-full bg-[var(--color-accent)]"
          style={{
            animationDuration: `${AUTOPLAY_MS}ms`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
          aria-hidden
        />
      </div>

      {/* One slide per viewport width, snapping. .no-scrollbar takes the bar away and nothing
          else: the track still scrolls, still swipes, and still works with the script gone. */}
      <div
        ref={trackRef}
        className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain"
      >
        {SLIDES.map((slide, slideIndex) => (
          <article
            key={slide.key}
            aria-roledescription="slide"
            aria-label={`${slideIndex + 1} of ${SLIDES.length}: ${slide.title}`}
            className={cn(
              'w-full shrink-0 snap-start rounded-3xl border border-[var(--color-border)] p-6 sm:p-8',
              'bg-[var(--color-surface-raised)] shadow-[var(--shadow-sm)]',
              'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center lg:gap-10',
            )}
          >
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-accent)]">
                {slide.icon}
                {slide.eyebrow}
              </span>
              <h3
                className="mt-4 text-[22px] font-extrabold leading-tight tracking-tight sm:text-[27px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {slide.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-text-muted)] sm:text-[15px]">
                {slide.body}
              </p>
              <ul className="mt-4 space-y-2">
                {slide.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--color-text-muted)]"
                  >
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]"
                      aria-hidden
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0">{slide.mock}</div>
          </article>
        ))}
      </div>

      {/*
        * Named tabs, not dots.
        *
        * Eleven dots are eleven identical marks: they say how many slides there are and nothing
        * about what is in them, so the only way to find "reminders" was to sit through the ones
        * before it. The names make the whole set readable at a glance and turn the nav into a
        * contents page — which on a landing page is most of what somebody scanning actually wants.
        *
        * The row scrolls rather than wrapping, so it stays one line on a phone, and the active tab is
        * scrolled into view when the deck moves on its own.
        */}
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Slides"
        className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1"
      >
        {SLIDES.map((slide, tabIndex) => (
          <button
            key={slide.key}
            type="button"
            role="tab"
            aria-selected={tabIndex === index}
            data-active={tabIndex === index || undefined}
            onClick={() => goTo(tabIndex)}
            className={cn(
              'anim-press shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
              tabIndex === index
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
            )}
          >
            {slide.tab}
          </button>
        ))}
      </div>
    </section>
  )
}
