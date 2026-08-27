import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlarmClock, CalendarClock, ChevronDown, History, Plus, Trash2, X } from 'lucide-react'
import type { NoteKind, Reminder, ReminderDraft, Task } from '../../types'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Collapse } from '../ui/Collapse'
import { Notice } from '../ui/Notice'
import { ReminderEditor } from './ReminderEditor'
import { TaskCountdown } from './TaskCountdown'
import { TaskHistoryPanel, type HistoryTab } from './TaskHistoryPanel'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useFolders } from '../../hooks/useFolders'
import { useAuth } from '../../hooks/useAuth'
import { useServerNow } from '../../hooks/useServerNow'
import { countdownLabel } from '../../lib/countdown'
import {
  currentTimezone,
  defaultReminderMessage,
  describeReminder,
  emptyDraft,
  isoToLocalInput,
  localInputToIso,
} from '../../lib/reminders'
import { getSupabaseClient } from '../../lib/supabase'
import { cn } from '../../lib/cn'

export interface TaskScheduleDialogProps {
  open: boolean
  task: Task
  onClose: () => void
}

/** The lead times offered the moment a deadline is set. Three, not eight: this is a prompt, and
 *  anything else is one tap further into the full editor. */
const DUE_REMINDER_SUGGESTIONS = [
  { minutes: 15, label: '15 min before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
]

/** How often to re-check while a reminder is overdue for its send. The sweep runs every minute,
 *  so this only has to be fine enough that the list settles shortly after it does. */
const SWEEP_POLL_MS = 15_000

const MODES: Array<{ kind: NoteKind; label: string; hint: string }> = [
  { kind: 'note', label: 'Normal note', hint: 'No deadline. Keeps its own colour.' },
  { kind: 'due_task', label: 'Due-date task', hint: 'Has a deadline, a countdown and a status.' },
]

/**
 * A reminder that is still going to fire.
 *
 * Shows what it will do and when, counting down live — "in 2h 15m" answers the question the
 * schedule only implies. There is no edit control: editing let a row be rewritten after it had
 * already been sent, which is exactly how a fired reminder ended up silently un-scheduling itself.
 * A reminder is cheap to delete and remake, and its history stays honest that way.
 */
function PendingReminderRow({
  reminder,
  hasDueDate,
  onToggle,
  onDelete,
}: {
  reminder: Reminder
  hasDueDate: boolean
  onToggle: (isActive: boolean) => void
  onDelete: () => void
}) {
  const armed = reminder.nextRunAt !== null && reminder.isActive
  const now = useServerNow(armed)

  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 px-2.5 py-2',
        !reminder.isActive && 'opacity-55',
      )}
    >
      <AlarmClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--color-text)]">
          {describeReminder(reminder)}
        </p>
        {reminder.message ? (
          <p className="truncate text-[11.5px] text-[var(--color-text-muted)]">{reminder.message}</p>
        ) : null}
        {reminder.kind === 'relative' && !hasDueDate ? (
          <p className="text-[11.5px] text-[var(--color-text-muted)]">Paused — needs a due date.</p>
        ) : !reminder.isActive ? (
          <p className="text-[11.5px] text-[var(--color-text-muted)]">Turned off.</p>
        ) : reminder.nextRunAt ? (
          <p className="text-[11.5px] font-medium tabular-nums text-[var(--color-accent)]">
            Sends in {countdownLabel(new Date(reminder.nextRunAt).getTime(), now).replace(' remaining', '')}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {/* A 14px checkbox is a miss on a phone. The box stays small; the label around it is what
          *  the finger lands on. */}
        <label
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-[var(--color-hover)]"
          title={reminder.isActive ? 'Turn off' : 'Turn on'}
        >
          <span className="sr-only">
            {reminder.isActive ? 'Turn off reminder' : 'Turn on reminder'}
          </span>
          <input
            type="checkbox"
            checked={reminder.isActive}
            onChange={(event) => onToggle(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
        </label>
        <IconButton label="Delete reminder" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </li>
  )
}

/**
 * Everything about when a note is due and when it should reach you.
 *
 * Two rules shape this panel:
 *
 *   The mode and the deadline are one decision, committed on Done. They used to save as you typed,
 *   which meant flipping the switch just to read the option already changed the note, and a
 *   half-typed date briefly produced a task with no deadline.
 *
 *   Reminders are not. Each is its own row in its own table and saves the moment it is added,
 *   because a reminder is a thing that exists rather than a field on a form. One that has already
 *   fired is history: it leaves the list below and appears in the log, with the time it went out.
 */
export function TaskScheduleDialog({ open, task, onClose }: TaskScheduleDialogProps) {
  const {
    updateTaskSchedule,
    getRemindersForTask,
    addReminder,
    setReminderActive,
    deleteReminder,
    refreshReminders,
    reminderError,
  } = useFolders()
  const { updateProfile } = useAuth()

  const [mode, setMode] = useState<NoteKind>(task.noteKind)
  const [dueValue, setDueValue] = useState(() => isoToLocalInput(task.dueAt))
  const [draft, setDraft] = useState<ReminderDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTab, setHistoryTab] = useState<HistoryTab>('all')
  /** Bumped whenever this dialog does something the log records, so the panel refetches. Those
   *  rows are written by database triggers and never come back through the write that caused them. */
  const [historyKey, setHistoryKey] = useState(0)
  const dueInputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const lastDraftRef = useRef<ReminderDraft | null>(null)
  const titleId = useId()

  const reminders = getRemindersForTask(task.id)
  // Reminders are delivered by a scheduled job on the server. Without a backend there is nothing
  // to run it, and promising an email the app can't send is worse than saying so.
  const canDeliver = getSupabaseClient() !== null

  useEffect(() => {
    if (open) {
      setMode(task.noteKind)
      setDueValue(isoToLocalInput(task.dueAt))
      setDraft(null)
      setHistoryOpen(false)
      setHistoryKey((key) => key + 1)
    }
    // Seeded when the dialog opens or switches note — deliberately not on task.dueAt, which would
    // re-seed the field from the server copy while it is being typed into.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id])

  /**
   * Reminders that fire while this panel is open.
   *
   * The sweep runs every minute on the server with no browser involved, so a reminder going out
   * changes rows this app is holding a stale copy of — the entry sat there saying "sends in 0s"
   * until the page was reloaded.
   *
   * Polling is scoped to exactly the window where it can help: only while a reminder is armed and
   * its moment has already passed, which is at most the minute between the due instant and the
   * sweep picking it up. As soon as the row comes back marked, the condition stops being true and
   * the timer stops with it.
   */
  const armedRunTimes = reminders
    .filter((reminder) => reminder.isActive && reminder.nextRunAt)
    .map((reminder) => new Date(reminder.nextRunAt as string).getTime())
  const now = useServerNow(open && armedRunTimes.length > 0)
  const awaitingSweep = armedRunTimes.some((runAt) => runAt <= now)

  useEffect(() => {
    if (!open || !awaitingSweep) {
      return
    }
    const timer = window.setInterval(() => {
      void refreshReminders().then(() => setHistoryKey((key) => key + 1))
    }, SWEEP_POLL_MS)
    return () => window.clearInterval(timer)
  }, [open, awaitingSweep, refreshReminders])

  useDialogFocus(open, dueInputRef)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  const parsedDue = localInputToIso(dueValue)
  const dueIncomplete = mode === 'due_task' && !parsedDue
  const hasDueDate = mode === 'due_task' && Boolean(parsedDue)
  const scheduleDirty = mode !== task.noteKind || (mode === 'due_task' && parsedDue !== task.dueAt)

  /**
   * Writes the mode and the deadline together.
   *
   * They are one invariant — a plain note has no deadline, and the database normalises any row
   * claiming otherwise — so they are never written apart. A due-date task with an unfinished date
   * is not written at all; the switch stays UI state until there is a real date and time behind it.
   */
  const commitSchedule = (): boolean => {
    if (mode === 'due_task' && !parsedDue) {
      return false
    }
    if (scheduleDirty) {
      updateTaskSchedule(task.id, mode, mode === 'due_task' ? parsedDue : null)
      setHistoryKey((key) => key + 1)
      if (mode === 'due_task' && parsedDue) {
        // The reminder email is rendered on a server with no idea where you are. Refreshed on
        // every save rather than once at sign-up, which covers setting a deadline after moving.
        void updateProfile({ timezone: currentTimezone() }).catch(() => undefined)
      }
    }
    return true
  }

  const handleDone = () => {
    if (!commitSchedule()) {
      return
    }
    onClose()
  }

  const startAdd = () => {
    setDraft(emptyDraft(hasDueDate ? 'relative' : 'one_time'))
  }

  const startDueReminder = (offsetMinutes: number) => {
    const seeded = { ...emptyDraft('relative'), offsetMinutes, offsetDirection: 'before' as const }
    // Seeded with the wording, not just the timing: the message field opens already filled in, so
    // the sentence that will arrive is visible and editable at the moment the reminder is made.
    setDraft({ ...seeded, message: defaultReminderMessage(seeded, task.title) })
  }

  const saveDraft = async () => {
    if (!draft || savingRef.current) {
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      // A reminder is its own object and saves on its own — adding one must not quietly commit a
      // mode switch or a deadline the user hasn't accepted yet.
      //
      // The single exception is the one kind that cannot exist without a deadline: a due-relative
      // reminder is defined by subtracting from one, so that much has to be written first or the
      // reminder lands disarmed.
      if (draft.kind === 'relative') {
        commitSchedule()
      }
      await addReminder(task.id, draft)
      setDraft(null)
      setHistoryKey((key) => key + 1)
    } catch {
      /* reminderError is surfaced below; the editor stays open with the user's input intact. */
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (draft) {
    lastDraftRef.current = draft
  }
  const addingDraft = draft ?? lastDraftRef.current

  /**
   * Still to come, versus already gone.
   *
   * A one-time or due-relative reminder that has fired has no next run and never will — it belongs
   * in the log, not in a list of things about to happen. A repeating one always has a next run, so
   * it stays. A switched-off reminder stays too: it is paused, not spent.
   */
  const pending = reminders.filter((reminder) => reminder.nextRunAt !== null || !reminder.isActive)
  const spentCount = reminders.length - pending.length
  const shouldOfferReminder = hasDueDate && pending.length === 0 && !draft

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center px-3 pb-[calc(var(--bottom-nav-inset)+0.5rem)] sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-dialog-in relative flex max-h-[min(78dvh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none sm:max-h-[min(90vh,44rem)] sm:rounded-2xl"
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--color-border-strong)] sm:hidden"
          aria-hidden
        />

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--color-accent-soft)' }}
              aria-hidden
            >
              <CalendarClock className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
            </span>
            {/* The note's name, because once this is centred over the page nothing else on screen
              *  says which card you clicked. */}
            <div className="min-w-0">
              <h2
                id={titleId}
                className="truncate text-[15px] font-semibold text-[var(--color-text)] sm:text-base"
              >
                Schedule
              </h2>
              <p className="truncate text-[12px] text-[var(--color-text-muted)]">
                {task.title.trim() || 'Untitled note'}
              </p>
            </div>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div
            role="radiogroup"
            aria-label="Note type"
            className="flex gap-1 rounded-xl bg-[var(--color-hover)] p-1"
          >
            {MODES.map((option) => (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={mode === option.kind}
                onClick={() => {
                  if (option.kind === mode) {
                    return
                  }
                  setMode(option.kind)
                  if (option.kind === 'due_task') {
                    requestAnimationFrame(() => dueInputRef.current?.focus())
                  }
                }}
                className={cn(
                  'anim-press min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-[12.5px] font-semibold transition-colors sm:px-3 sm:text-[13px]',
                  mode === option.kind
                    ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--color-text-muted)]">
            {MODES.find((option) => option.kind === mode)?.hint}
          </p>

          <Collapse open={mode === 'due_task'}>
            <div className="pt-4">
              <label
                htmlFor={`${titleId}-due`}
                className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
              >
                Due date &amp; time
              </label>
              <input
                ref={dueInputRef}
                id={`${titleId}-due`}
                type="datetime-local"
                value={dueValue}
                onChange={(event) => setDueValue(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
              />
              {dueIncomplete ? (
                <Notice tone="danger" className="mt-1.5">
                  Pick a date <em className="not-italic font-semibold">and</em> a time.
                </Notice>
              ) : null}
              {/* Counts against the date in the field, not the saved one, so the effect of a change
                *  is visible before Done commits it. */}
              {parsedDue ? (
                <div className="mt-2">
                  <TaskCountdown task={{ ...task, noteKind: 'due_task', dueAt: parsedDue }} />
                </div>
              ) : null}
            </div>
          </Collapse>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Reminders
              </h3>
              <button
                type="button"
                onClick={startAdd}
                disabled={dueIncomplete}
                aria-hidden={Boolean(draft)}
                inert={Boolean(draft)}
                title={dueIncomplete ? 'Set a due date and time first' : undefined}
                className={cn(
                  'anim-press inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-accent)] transition-all duration-200 ease-out hover:bg-[var(--color-accent-soft-hover)]',
                  draft && 'pointer-events-none opacity-0',
                  dueIncomplete && 'cursor-not-allowed opacity-40 hover:bg-[var(--color-accent-soft)]',
                )}
              >
                <Plus className="h-3 w-3" aria-hidden />
                Add reminder
              </button>
            </div>

            {!canDeliver ? (
              <Notice className="mt-2">
                No backend in this build — reminders can be set up, but no email will be sent.
              </Notice>
            ) : null}

            {reminderError ? (
              <Notice tone="danger" className="mt-2">
                {reminderError}
              </Notice>
            ) : null}

            <Collapse open={shouldOfferReminder}>
              <div className="mt-2 rounded-xl border border-[var(--color-accent)]/25 bg-[var(--color-accent-soft)]/50 px-3 py-2.5">
                <p className="text-[12.5px] font-medium text-[var(--color-text)]">
                  Want an email reminder for this deadline?
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {DUE_REMINDER_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.minutes}
                      type="button"
                      onClick={() => startDueReminder(suggestion.minutes)}
                      className="anim-press rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-surface)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-soft-hover)]"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={startAdd}
                    className="anim-press rounded-full px-2 py-1 text-[11.5px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                  >
                    Something else…
                  </button>
                </div>
              </div>
            </Collapse>

            {dueIncomplete && pending.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-[var(--color-text-muted)]">
                Set the due date and time above, then add reminders for it.
              </p>
            ) : pending.length === 0 && !draft && !shouldOfferReminder ? (
              <p className="mt-2 text-[12.5px] text-[var(--color-text-muted)]">
                {spentCount > 0
                  ? 'Every reminder on this note has been sent — they are in the history below.'
                  : 'No reminders yet. They work whether or not this note has a due date.'}
              </p>
            ) : null}

            <ul className="mt-2 flex flex-col gap-1.5">
              {pending.map((reminder) => (
                <PendingReminderRow
                  key={reminder.id}
                  reminder={reminder}
                  hasDueDate={hasDueDate}
                  onToggle={(isActive) =>
                    void setReminderActive(reminder.id, isActive).catch(() => undefined)
                  }
                  onDelete={() =>
                    void deleteReminder(reminder.id)
                      .then(() => setHistoryKey((key) => key + 1))
                      .catch(() => undefined)
                  }
                />
              ))}
            </ul>

            <Collapse open={Boolean(draft)}>
              {addingDraft ? (
                <div className="pt-2">
                  <ReminderEditor
                    draft={addingDraft}
                    hasDueDate={hasDueDate}
                    taskTitle={task.title}
                    onChange={setDraft}
                    onSave={() => void saveDraft()}
                    onCancel={() => setDraft(null)}
                    saving={saving}
                  />
                </div>
              ) : null}
            </Collapse>
          </div>

          {/* The log, behind a disclosure. It is a reference rather than something to read every
            *  time the panel opens — and it costs a request, so it only fetches once opened. */}
          <div className="mt-5 border-t border-[var(--color-border)] pt-3">
            <button
              type="button"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((current) => !current)}
              className="anim-press flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              History
              <ChevronDown
                className={cn(
                  'ml-auto h-3.5 w-3.5 transition-transform duration-200',
                  historyOpen && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
            <Collapse open={historyOpen}>
              <TaskHistoryPanel
                taskId={task.id}
                open={historyOpen}
                tab={historyTab}
                onTabChange={setHistoryTab}
                reloadKey={historyKey}
              />
            </Collapse>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
          <Button type="button" variant="subtle" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleDone}
            disabled={dueIncomplete}
            title={dueIncomplete ? 'Set a due date and time first' : undefined}
          >
            Done
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
