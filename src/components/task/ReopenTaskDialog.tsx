import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CalendarClock, RotateCcw } from 'lucide-react'
import type { Task } from '../../types'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useServerNow } from '../../hooks/useServerNow'
import { formatDueDate } from '../../lib/dueDate'
import { isoToLocalInput, localInputToIso } from '../../lib/reminders'
import { taskLifecycle } from '../../lib/taskLifecycle'
import { cn } from '../../lib/cn'

/**
 * What happens between clicking the tick on a finished task and it becoming unfinished.
 *
 * Ticking a task off is cheap to undo; *un*-ticking it is not. `completedAt` is the only record
 * of when the work was actually finished, and clearing it throws away the one fact that separates
 * "done on time" from "done two days late" — so a stray tap on a card in a list could quietly
 * destroy the answer to a question the whole lifecycle exists to answer. Hence a confirmation on
 * the way back, and none on the way forward.
 *
 * The second question is the one that makes reopening usable rather than just safe. A task that
 * was completed is nearly always past its deadline by now, so reopening it lands it straight in
 * Overdue — technically true and almost never what was meant. Asking here is the only moment the
 * app knows a deadline is about to become wrong.
 *
 * The picker will not accept a time that has already gone. A new deadline in the past is a task
 * that is reopened and overdue in the same instant, which is the state this dialog exists to
 * avoid; if that is genuinely wanted, keeping the old deadline already does it.
 */

export interface ReopenTaskDialogProps {
  open: boolean
  task: Task
  onCancel: () => void
  /** `null` keeps the existing deadline; an ISO string replaces it. */
  onConfirm: (nextDueAt: string | null) => void
}

type Step = 'confirm' | 'deadline'

export function ReopenTaskDialog({ open, task, onCancel, onConfirm }: ReopenTaskDialogProps) {
  const titleId = useId()
  const fieldId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<Step>('confirm')
  const [dueValue, setDueValue] = useState('')
  const now = useServerNow(open)

  useDialogFocus(open, panelRef)

  /* No effect resetting `step` and `dueValue` between openings: the hook that owns this dialog
     keys it by task id and unmounts it on every close, so each opening is a fresh mount and the
     useState initialisers above are the reset. An effect doing the same job would only be a
     second render on the way in, and a way for the two to disagree. */

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, open])

  // The floor for the picker, as the input's own local format. A minute ahead rather than exactly
  // now, so a date typed while the clock ticks over isn't rejected for being a second stale.
  const minValue = useMemo(() => isoToLocalInput(new Date(now + 60_000).toISOString()), [now])

  if (!open) {
    return null
  }

  const lifecycle = taskLifecycle(task, now)
  const finishedLate = lifecycle === 'completed_late'
  const deadlinePassed = task.dueAt !== null && new Date(task.dueAt).getTime() <= now
  const title = task.title.trim() || 'Untitled'

  const chosenIso = localInputToIso(dueValue)
  const chosenInPast = chosenIso !== null && new Date(chosenIso).getTime() <= now
  const canSaveNewDate = chosenIso !== null && !chosenInPast

  const body =
    step === 'confirm' ? (
      <>
        <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
          <span className="font-medium text-[var(--color-text)]">{title}</span> is marked{' '}
          {finishedLate ? 'completed late' : 'completed on time'}
          {task.completedAt ? ` — finished ${formatDueDate(task.completedAt)}` : ''}. Reopening
          clears that record, and it cannot be recovered.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="subtle" size="sm" onClick={onCancel}>
            Keep it done
          </Button>
          <Button size="sm" onClick={() => setStep('deadline')}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reopen
          </Button>
        </div>
      </>
    ) : (
      <>
        <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-text-muted)]">
          {task.dueAt ? (
            <>
              Its deadline is{' '}
              <span className="font-medium text-[var(--color-text)]">
                {formatDueDate(task.dueAt)}
              </span>
              {deadlinePassed
                ? ', which has already passed — keeping it means this reopens as overdue.'
                : ', which is still ahead.'}
            </>
          ) : (
            'This task has no deadline. You can give it one now, or reopen it without.'
          )}
        </p>

        <label
          htmlFor={fieldId}
          className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
        >
          New deadline
        </label>
        <input
          id={fieldId}
          type="datetime-local"
          value={dueValue}
          // The browser's own floor. It is a courtesy, not the check — a typed value can still
          // land in the past, which is what chosenInPast below is for.
          min={minValue}
          onChange={(event) => setDueValue(event.target.value)}
          className={cn(
            'mt-1.5 w-full rounded-lg border bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors',
            'focus:bg-[var(--color-surface)] focus:ring-2',
            chosenInPast
              ? 'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20'
              : 'border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]/20',
          )}
        />
        {chosenInPast ? (
          <Notice tone="danger" className="mt-1.5">
            That time has already passed — pick one in the future.
          </Notice>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="subtle" size="sm" onClick={() => onConfirm(null)}>
            {task.dueAt ? 'Keep the deadline' : 'Reopen without one'}
          </Button>
          <Button size="sm" disabled={!canSaveNewDate} onClick={() => onConfirm(chosenIso)}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Reopen with new date
          </Button>
        </div>
      </>
    )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="anim-dialog-in relative max-h-[min(90vh,32rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] outline-none"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
            aria-hidden
          >
            {step === 'confirm' ? (
              <RotateCcw className="h-4 w-4" aria-hidden />
            ) : (
              <CalendarClock className="h-4 w-4" aria-hidden />
            )}
          </span>
          <h2 id={titleId} className="text-[15px] font-semibold text-[var(--color-text)]">
            {step === 'confirm' ? 'Reopen this task?' : 'Change the deadline?'}
          </h2>
        </div>
        {body}
      </div>
    </div>
  )
}
