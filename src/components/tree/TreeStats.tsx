import type { ComponentType } from 'react'
import {
  AlarmClock,
  CheckCircle2,
  Clock,
  Folder as FolderIcon,
  ListTree,
  Star,
} from 'lucide-react'
import { useCountUp } from '../../hooks/useCountUp'
import type { TaskStats } from '../../lib/taskFilters'
import { cn } from '../../lib/cn'

/**
 * The workspace's numbers, and what state its deadlines are actually in.
 *
 * The Tree used to show four counts — folders, notes, starred, root folders — three of which are
 * facts about how things are *filed* rather than about the work. Filing is what the tree below
 * already draws. The counts that earn a card at the top of a summary page are the ones that
 * change what you do next, which is why overdue and completed are here and "root folders" has
 * been folded into the folders card as a sub-line.
 */

export interface TreeStatsProps {
  stats: TaskStats
  foldersTotal: number
  rootFolders: number
  importantFolders: number
  /** Clicking a card that stands for a filterable set applies that filter to the list below. */
  onSelectStatus?: (status: 'all' | 'overdue' | 'completed' | 'incomplete') => void
  className?: string
}

interface StatCardProps {
  label: string
  value: number
  hint?: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  color: string
  soft: string
  onClick?: () => void
  /** Draws attention to itself when non-zero — overdue is the only count that qualifies. */
  alert?: boolean
}

/**
 * One number, laid out sideways.
 *
 * These used to stack — icon, then number, then label, then hint — which made each card about
 * 115px tall, and six of them two-abreast on a phone filled the screen before a single note was
 * visible. On a summary page that is the wrong thing to be looking at. Read across instead of
 * down, a card is half the height and says exactly as much.
 */
function StatCard({ label, value, hint, icon: Icon, color, soft, onClick, alert }: StatCardProps) {
  const shown = useCountUp(value)
  const urgent = Boolean(alert) && value > 0
  const content = (
    <>
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: soft, color }}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span
            className="shrink-0 text-[19px] font-semibold leading-tight tabular-nums sm:text-[21px]"
            style={{
              fontFamily: 'var(--font-display)',
              color: urgent ? color : 'var(--color-text)',
            }}
          >
            {shown}
          </span>
          <span className="min-w-0 truncate text-[11.5px] font-medium text-[var(--color-text-muted)] sm:text-[12.5px]">
            {label}
          </span>
        </span>
        {hint ? (
          <span className="truncate text-[10.5px] leading-snug text-[var(--color-text-muted)] opacity-75">
            {hint}
          </span>
        ) : null}
      </span>
    </>
  )

  const shell = cn(
    'flex items-center gap-2.5 rounded-2xl border bg-[var(--color-surface)] p-2.5 text-left shadow-[var(--shadow-sm)] sm:p-3',
    'transition-colors',
    urgent ? 'border-transparent' : 'border-[var(--color-border)]',
    onClick && 'hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
  )
  const style = urgent ? { borderColor: `color-mix(in srgb, ${color} 45%, transparent)` } : undefined

  if (!onClick) {
    return (
      <div className={shell} style={style}>
        {content}
      </div>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cn(shell, 'anim-press')} style={style}>
      {content}
    </button>
  )
}

/** One segment of the deadline bar. */
interface Segment {
  key: string
  label: string
  value: number
  color: string
}

/**
 * Every tracked task as one bar.
 *
 * Four counts in four cards say how many; one bar says what the *shape* is — that a workspace is
 * two-thirds overdue is a thing you see here and have to work out there. It is drawn from the
 * same lifecycle counts, so the two can't disagree.
 */
function DeadlineBar({ stats }: { stats: TaskStats }) {
  const segments: Segment[] = [
    { key: 'overdue', label: 'Overdue', value: stats.overdue, color: 'var(--color-danger)' },
    { key: 'upcoming', label: 'Not due yet', value: stats.upcoming, color: 'var(--task-slate-solid)' },
    { key: 'on_time', label: 'On time', value: stats.completedOnTime, color: 'var(--cat-emerald)' },
    { key: 'late', label: 'Late', value: stats.completedLate, color: 'var(--task-amber-solid)' },
  ].filter((segment) => segment.value > 0)

  if (stats.tracked === 0) {
    return null
  }

  const percent = Math.round(stats.completionRatio * 100)

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-[var(--shadow-sm)] sm:p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-semibold text-[var(--color-text)]">
          Deadline health
        </span>
        <span className="text-[11.5px] text-[var(--color-text-muted)]">
          <span className="font-semibold tabular-nums text-[var(--color-text)]">{percent}%</span> of{' '}
          {stats.tracked} due-date {stats.tracked === 1 ? 'task' : 'tasks'} done
        </span>
      </div>

      <div
        className="mt-2 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-[var(--color-hover)]"
        role="img"
        aria-label={segments.map((segment) => `${segment.value} ${segment.label}`).join(', ')}
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${(segment.value / stats.tracked) * 100}%`,
              background: segment.color,
            }}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: segment.color }}
              aria-hidden
            />
            {segment.label}
            <span className="font-semibold tabular-nums text-[var(--color-text)]">
              {segment.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function TreeStats({
  stats,
  foldersTotal,
  rootFolders,
  importantFolders,
  onSelectStatus,
  className,
}: TreeStatsProps) {
  return (
    <div className={cn('flex flex-col gap-2 sm:gap-2.5', className)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 xl:grid-cols-6">
        <StatCard
          label="Notes"
          value={stats.total}
          hint={`${stats.notes} plain · ${stats.tracked} tracked`}
          icon={ListTree}
          color="var(--cat-teal)"
          soft="var(--cat-teal-soft)"
          onClick={onSelectStatus ? () => onSelectStatus('all') : undefined}
        />
        <StatCard
          label="Not due yet"
          value={stats.upcoming}
          hint={`${stats.incomplete} unfinished`}
          icon={Clock}
          color="var(--color-accent)"
          soft="var(--color-accent-soft)"
          onClick={onSelectStatus ? () => onSelectStatus('incomplete') : undefined}
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          hint={stats.overdue > 0 ? 'Needs attention' : 'All clear'}
          icon={AlarmClock}
          color="var(--color-danger)"
          soft="color-mix(in srgb, var(--color-danger) 12%, transparent)"
          onClick={onSelectStatus ? () => onSelectStatus('overdue') : undefined}
          alert
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          hint={`${stats.completedOnTime} on time · ${stats.completedLate} late`}
          icon={CheckCircle2}
          color="var(--cat-emerald)"
          soft="var(--cat-emerald-soft)"
          onClick={onSelectStatus ? () => onSelectStatus('completed') : undefined}
        />
        <StatCard
          label="Folders"
          value={foldersTotal}
          hint={`${rootFolders} at the root`}
          icon={FolderIcon}
          color="var(--cat-indigo)"
          soft="var(--cat-indigo-soft)"
        />
        <StatCard
          label="Starred"
          value={stats.important + importantFolders}
          hint={`${stats.important} notes · ${importantFolders} folders`}
          icon={Star}
          color="var(--cat-rose)"
          soft="var(--cat-rose-soft)"
        />
      </div>

      <DeadlineBar stats={stats} />
    </div>
  )
}
