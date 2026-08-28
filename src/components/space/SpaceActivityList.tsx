import { Pencil } from 'lucide-react'
import type { SpaceActivityEntry } from '../../types'
import { ACTION_ICONS, actorLabel, describeAction, formatMoment } from '../../lib/spaceActivity'
import { cn } from '../../lib/cn'

export interface SpaceActivityListProps {
  entries: SpaceActivityEntry[]
  /** Hidden on a single item's own history, where every line is about the same thing. */
  showEntity?: boolean
  className?: string
}

/** Whose action it was, with their face on it. */
function ActorPill({ entry }: { entry: SpaceActivityEntry }) {
  const name = actorLabel(entry)
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--color-surface-muted)] py-0.5 pl-0.5 pr-2">
      {entry.actorAvatarUrl ? (
        <img src={entry.actorAvatarUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))' }}
          aria-hidden
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate text-[12px] font-semibold text-[var(--color-text)]">
        {name}
      </span>
    </span>
  )
}

/**
 * What happened, newest first.
 *
 * Two pills per line rather than one sentence: the actor, then the action. Both are drawn from a
 * fixed set — the action is one of thirteen the database derives from the row itself — so a column
 * of them can be scanned, and the same words appear in the filter above. Read as prose it was a
 * paragraph per row and the only way to find "everything Priya deleted" was to read all of them.
 *
 * Shared by the space's feed and by one item's own history, because they are the same rows asked for
 * two different ways — which is also why the entity name and path can be turned off rather than
 * duplicated on every line of a panel that is already about one note.
 */
export function SpaceActivityList({
  entries,
  showEntity = true,
  className,
}: SpaceActivityListProps) {
  return (
    <ol className={cn('flex flex-col gap-1.5', className)}>
      {entries.map((entry) => {
        const Icon = ACTION_ICONS[entry.action] ?? Pencil
        return (
          <li
            key={entry.id}
            className="flex items-start gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-2"
          >
            <span
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              aria-hidden
            >
              <Icon className="h-3.5 w-3.5" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <ActorPill entry={entry} />
                <span className="inline-flex items-center rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-[12px] font-semibold text-[var(--color-accent-ink)]">
                  {describeAction(entry)}
                </span>
              </span>

              {showEntity && entry.entityTitle ? (
                /* The title as it was, not a join: this is the only thing that keeps a "deleted"
                 * line readable, and those are the ones people come looking for. */
                <span className="mt-1 block truncate text-[13px] font-medium text-[var(--color-text)]">
                  {entry.entityTitle}
                </span>
              ) : null}

              {showEntity && entry.pathLabel ? (
                <span className="mt-0.5 block truncate text-[11.5px] text-[var(--color-text-muted)]">
                  {entry.pathLabel}
                </span>
              ) : null}

              {entry.intent ? (
                <span className="mt-0.5 block text-[11.5px] italic text-[var(--color-text-muted)]">
                  {entry.intent}
                </span>
              ) : null}
            </span>

            <span className="mt-0.5 shrink-0 text-[11.5px] tabular-nums text-[var(--color-text-muted)]">
              {formatMoment(entry.occurredAt)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
