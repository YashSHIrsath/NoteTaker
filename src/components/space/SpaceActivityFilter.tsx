import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Users, X } from 'lucide-react'
import type { SpaceActivityAction, SpaceMember } from '../../types'
import { ACTION_ICONS, ACTION_LABELS, ACTIVITY_ACTIONS } from '../../lib/spaceActivity'
import type { SpaceActivityFilters } from '../../hooks/useSpaceActivity'
import { cn } from '../../lib/cn'

export interface SpaceActivityFilterProps {
  members: SpaceMember[]
  value: SpaceActivityFilters
  onChange: (next: SpaceActivityFilters) => void
}

/** Adds or removes one value, which is all either of these lists ever does. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

/**
 * One dropdown holding checkboxes.
 *
 * A menu rather than a row of chips because both lists are long enough to wrap — a space can have
 * fifty people in it, and there are thirteen kinds of change. Closed, it says what is selected;
 * open, it is a list you tick through without it closing under you, because picking three people is
 * one gesture and not three.
 */
function MultiSelect({
  label,
  summary,
  active,
  children,
}: {
  label: string
  summary: string
  active: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'anim-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
          active
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]'
            : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
        )}
      >
        <span className="max-w-[11rem] truncate">{summary}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open ? (
        <div
          role="group"
          aria-label={label}
          className={cn(
            'anim-dialog-in absolute left-0 top-[calc(100%+0.35rem)] z-30 flex max-h-72 w-64 flex-col overflow-y-auto',
            'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-lg)]',
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** One tickable row inside a dropdown. */
function Option({
  checked,
  icon,
  label,
  hint,
  onClick,
}: {
  checked: boolean
  icon?: ReactNode
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
        'hover:bg-[var(--color-hover)]',
      )}
    >
      <span
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
          checked
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
            : 'border-[var(--color-border-strong)]',
        )}
        aria-hidden
      >
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-[var(--color-text)]">
          {label}
        </span>
        {hint ? (
          <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{hint}</span>
        ) : null}
      </span>
    </button>
  )
}

/**
 * Who, and what — the two questions anyone brings to a log.
 *
 * Both are multi-select, because the real question is usually a small set rather than one value:
 * "what did the two of them delete last week". Both empty means unfiltered, and the selection is
 * sent to the server rather than applied to the page on screen — the feed is paged fifty at a time
 * and kept for a year, so filtering here would search only what had already been scrolled past.
 */
export function SpaceActivityFilter({ members, value, onChange }: SpaceActivityFilterProps) {
  const actorSummary =
    value.actorIds.length === 0
      ? 'Anyone'
      : value.actorIds.length === 1
        ? (() => {
            const only = members.find((member) => member.userId === value.actorIds[0])
            return only?.fullName?.trim() || only?.email || '1 person'
          })()
        : `${value.actorIds.length} people`

  const actionSummary =
    value.actions.length === 0
      ? 'Any change'
      : value.actions.length === 1
        ? ACTION_LABELS[value.actions[0]!]
        : `${value.actions.length} kinds`

  const filtering = value.actorIds.length > 0 || value.actions.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelect label="Filter by person" summary={actorSummary} active={value.actorIds.length > 0}>
        {members.length === 0 ? (
          <p className="px-2 py-1.5 text-[12px] text-[var(--color-text-muted)]">Nobody to filter by</p>
        ) : (
          members.map((member) => (
            <Option
              key={member.userId}
              checked={value.actorIds.includes(member.userId)}
              label={member.fullName?.trim() || member.email}
              hint={member.fullName?.trim() ? member.email : undefined}
              icon={
                member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))' }}
                    aria-hidden
                  >
                    {(member.fullName?.trim() || member.email || '?').charAt(0).toUpperCase()}
                  </span>
                )
              }
              onClick={() => onChange({ ...value, actorIds: toggle(value.actorIds, member.userId) })}
            />
          ))
        )}
      </MultiSelect>

      <MultiSelect
        label="Filter by kind of change"
        summary={actionSummary}
        active={value.actions.length > 0}
      >
        {ACTIVITY_ACTIONS.map((action) => {
          const Icon = ACTION_ICONS[action]
          return (
            <Option
              key={action}
              checked={value.actions.includes(action)}
              label={ACTION_LABELS[action]}
              icon={
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  aria-hidden
                >
                  <Icon className="h-3 w-3" />
                </span>
              }
              onClick={() =>
                onChange({ ...value, actions: toggle(value.actions, action) as SpaceActivityAction[] })
              }
            />
          )
        })}
      </MultiSelect>

      {/* Only while something is selected: a permanent "clear" next to an empty filter is a control
        * that does nothing, and this row is already two buttons wide on a phone. */}
      {filtering ? (
        <button
          type="button"
          onClick={() => onChange({ actorIds: [], actions: [] })}
          className="anim-press inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--color-text-muted)]">
          <Users className="h-3.5 w-3.5" aria-hidden />
          Everyone, every change
        </span>
      )}
    </div>
  )
}
