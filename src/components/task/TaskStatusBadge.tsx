import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TaskStatus } from '../../types'
import { STATUS_LABELS } from '../../lib/taskStatus'
import { cn } from '../../lib/cn'
import { useToggleFeedback } from '../../hooks/useToggleFeedback'

const STATUS_ICON: Record<TaskStatus, ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  pending: Circle,
  ongoing: CircleDot,
  complete: CheckCircle2,
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: 'border-[var(--color-border)] bg-[var(--color-hover)] text-[var(--color-text-muted)]',
  ongoing: 'border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
  complete: 'border-[var(--cat-emerald)]/30 bg-[var(--cat-emerald-soft)] text-[var(--cat-emerald-ink)]',
}

export interface TaskStatusBadgeProps {
  status: TaskStatus
  onCycle: () => void
  compact?: boolean
  /** Just the symbol — for the note header, where the label is redundant next to the icon. */
  iconOnly?: boolean
}

/** Click cycles Incomplete -> Ongoing -> Complete -> Incomplete. */
export function TaskStatusBadge({ status, onCycle, compact = false, iconOnly = false }: TaskStatusBadgeProps) {
  const Icon = STATUS_ICON[status]
  // Cycling is a three-state toggle; the icon acknowledges each step the same way star/pin do.
  const popping = useToggleFeedback(status)
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onCycle()
      }}
      aria-label={`Task status: ${STATUS_LABELS[status]}. Click to change.`}
      title={STATUS_LABELS[status]}
      className={cn(
        'anim-press inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors hover:brightness-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        iconOnly
          ? 'h-[18px] w-[18px] justify-center'
          : compact
            ? 'px-2 py-0.5 text-[11px]'
            : 'px-2.5 py-1 text-[12.5px]',
        STATUS_STYLES[status],
      )}
    >
      <Icon
        className={cn(iconOnly || compact ? 'h-3 w-3' : 'h-3.5 w-3.5', popping && 'anim-pop')}
        aria-hidden
      />
      {iconOnly ? null : STATUS_LABELS[status]}
    </button>
  )
}
