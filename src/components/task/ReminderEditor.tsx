import { useEffect, useId, useState } from 'react'
import type { ReminderDraft, ReminderKind } from '../../types'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { Collapse } from '../ui/Collapse'
import {
  MAX_OFFSET_MINUTES,
  OFFSET_PRESETS,
  OFFSET_UNITS,
  WEEKDAYS,
  defaultReminderMessage,
  isPastOneTime,
  isoToLocalInput,
  joinOffset,
  localDateValue,
  localInputToIso,
  splitOffset,
} from '../../lib/reminders'
import { serverNowMs } from '../../lib/serverClock'
import { cn } from '../../lib/cn'

/** One shared look for every control in here, so a row of them reads as one control strip. */
const FIELD =
  'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-[13px] text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20'

const LABEL = 'block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]'

/**
 * The three shapes a reminder can take, named as choices rather than as data kinds.
 *
 * "Relative to due date" is offered only when there is a due date to be relative to — an offset
 * from nothing has no meaning, and the database would store it disarmed, which would look like a
 * reminder that silently never fires.
 */
const KIND_TABS: Array<{ kind: ReminderKind; label: string }> = [
  { kind: 'one_time', label: 'Once' },
  { kind: 'recurring', label: 'Repeats' },
  { kind: 'relative', label: 'Due-relative' },
]

export interface ReminderEditorProps {
  draft: ReminderDraft
  /** Hides the due-relative option and its tab when the note has no deadline. */
  hasDueDate: boolean
  taskTitle: string
  onChange: (draft: ReminderDraft) => void
  onSave: () => void
  onCancel: () => void
  saving?: boolean
}

export function ReminderEditor({
  draft,
  hasDueDate,
  taskTitle,
  onChange,
  onSave,
  onCancel,
  saving = false,
}: ReminderEditorProps) {
  const ids = useId()
  const [messageOpen, setMessageOpen] = useState(Boolean(draft.message))
  /**
   * Whether the wording is the user's or ours.
   *
   * Until it has been edited, the message is a description of the schedule and follows it —
   * changing "15 minutes" to "1 day" rewrites the sentence. Once someone types their own words,
   * it stops tracking, because silently overwriting what they wrote because they nudged the
   * schedule afterwards would be the worst possible behaviour here.
   */
  const [messageEdited, setMessageEdited] = useState(false)

  const set = (patch: Partial<ReminderDraft>) => onChange({ ...draft, ...patch })
  const tabs = KIND_TABS.filter((tab) => tab.kind !== 'relative' || hasDueDate)

  const offset = splitOffset(draft.offsetMinutes ?? 15)
  const generatedMessage = defaultReminderMessage(draft, taskTitle)
  // Real text in the field, not a placeholder: what will be sent is what is on screen, and it is
  // already correct — editing it is a choice rather than a chore.
  const messageValue = draft.message ?? generatedMessage
  const pastOneTime = isPastOneTime(draft, serverNowMs())

  /**
   * Keeps the stored text equal to the shown text while the field is open.
   *
   * Without this the field would display our sentence while the draft held null, and the *server*
   * would write the final wording — two generators that have to agree forever. Storing what is on
   * screen means there is one. A closed field still stores null and lets the server phrase it,
   * which is the case where nobody has expressed an opinion.
   */
  useEffect(() => {
    if (messageOpen && !messageEdited && draft.message !== generatedMessage) {
      onChange({ ...draft, message: generatedMessage })
    }
  }, [messageOpen, messageEdited, generatedMessage, draft, onChange])

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 p-3">
      <div
        role="tablist"
        aria-label="Reminder type"
        className="flex gap-1 rounded-lg bg-[var(--color-hover)] p-0.5"
      >
        {tabs.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            aria-selected={draft.kind === tab.kind}
            onClick={() => set({ kind: tab.kind })}
            className={cn(
              'anim-press min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors',
              draft.kind === tab.kind
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {draft.kind === 'one_time' ? (
          <div>
            <label className={LABEL} htmlFor={`${ids}-at`}>
              Date &amp; time
            </label>
            <input
              id={`${ids}-at`}
              type="datetime-local"
              value={isoToLocalInput(draft.atUtc)}
              onChange={(event) => set({ atUtc: localInputToIso(event.target.value) })}
              className={cn(FIELD, 'mt-1 w-full')}
            />
          </div>
        ) : null}

        {draft.kind === 'recurring' ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[92px] flex-1">
              <label className={LABEL} htmlFor={`${ids}-unit`}>
                Repeat
              </label>
              <select
                id={`${ids}-unit`}
                value={draft.recurUnit ?? 'day'}
                onChange={(event) => {
                  const unit = event.target.value === 'week' ? 'week' : 'day'
                  // A weekly series needs a weekday and a daily one must not carry a stale
                  // leftover, or the saved row would describe two schedules at once.
                  set({
                    recurUnit: unit,
                    recurWeekday: unit === 'week' ? draft.recurWeekday ?? 1 : null,
                    anchorDate: draft.anchorDate ?? localDateValue(new Date()),
                  })
                }}
                className={cn(FIELD, 'mt-1 w-full')}
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
              </select>
            </div>

            <div className="w-[70px]">
              <label className={LABEL} htmlFor={`${ids}-every`}>
                Every
              </label>
              <input
                id={`${ids}-every`}
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={draft.recurInterval ?? 1}
                onChange={(event) => set({ recurInterval: Number(event.target.value) })}
                className={cn(FIELD, 'no-spinner mt-1 w-full')}
              />
            </div>

            <div className="flex items-end pb-1.5 text-[12px] text-[var(--color-text-muted)]">
              {draft.recurUnit === 'week' ? 'week(s)' : 'day(s)'}
            </div>

            {draft.recurUnit === 'week' ? (
              <div className="min-w-[104px] flex-1">
                <label className={LABEL} htmlFor={`${ids}-weekday`}>
                  On
                </label>
                <select
                  id={`${ids}-weekday`}
                  value={draft.recurWeekday ?? 1}
                  onChange={(event) => set({ recurWeekday: Number(event.target.value) })}
                  className={cn(FIELD, 'mt-1 w-full')}
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="min-w-[92px] flex-1">
              <label className={LABEL} htmlFor={`${ids}-time`}>
                At
              </label>
              <input
                id={`${ids}-time`}
                type="time"
                value={draft.recurTime ?? '09:00'}
                onChange={(event) => set({ recurTime: event.target.value })}
                className={cn(FIELD, 'mt-1 w-full')}
              />
            </div>
          </div>
        ) : null}

        {draft.kind === 'relative' ? (
          <div>
            {/* Typed rather than picked from a list. The old fixed menu stopped at "1 week", so
              *  "90 days after" simply wasn't expressible; a number and a unit covers anything from
              *  a minute to a decade without a menu that long. */}
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-[76px]">
                <label className={LABEL} htmlFor={`${ids}-amount`}>
                  Remind
                </label>
                <input
                  id={`${ids}-amount`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_OFFSET_MINUTES}
                  value={offset.amount}
                  onChange={(event) =>
                    set({ offsetMinutes: joinOffset(Number(event.target.value), offset.unit) })
                  }
                  className={cn(FIELD, 'no-spinner mt-1 w-full')}
                />
              </div>

              <div className="min-w-[104px] flex-1">
                <label className={LABEL} htmlFor={`${ids}-unit`}>
                  &nbsp;
                </label>
                <select
                  id={`${ids}-unit`}
                  value={offset.unit}
                  onChange={(event) =>
                    set({
                      offsetMinutes: joinOffset(
                        offset.amount,
                        event.target.value as typeof offset.unit,
                      ),
                    })
                  }
                  className={cn(FIELD, 'mt-1 w-full')}
                >
                  {OFFSET_UNITS.map((unit) => (
                    <option key={unit.key} value={unit.key}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[116px] flex-1">
                <label className={LABEL} htmlFor={`${ids}-direction`}>
                  &nbsp;
                </label>
                <select
                  id={`${ids}-direction`}
                  value={draft.offsetDirection ?? 'before'}
                  onChange={(event) =>
                    set({ offsetDirection: event.target.value === 'after' ? 'after' : 'before' })
                  }
                  className={cn(FIELD, 'mt-1 w-full')}
                >
                  <option value="before">before due</option>
                  <option value="after">after due</option>
                </select>
              </div>
            </div>

            {/* The two or three lead times people reach for, so the common case is still one tap. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[var(--color-text-muted)]">Quick:</span>
              {OFFSET_PRESETS.map((preset) => (
                <button
                  key={preset.minutes}
                  type="button"
                  onClick={() => set({ offsetMinutes: preset.minutes })}
                  className={cn(
                    'anim-press rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                    draft.offsetMinutes === preset.minutes
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => set({ offsetMinutes: 0 })}
                className={cn(
                  'anim-press rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  draft.offsetMinutes === 0
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                )}
              >
                At the due time
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Kept behind a disclosure: most reminders don't need one, and a permanently open textarea
          made the compact editor twice as tall for a field usually left blank. */}
      <div className="mt-3">
        <Collapse open={messageOpen}>
          <label className={LABEL} htmlFor={`${ids}-message`}>
            Message
          </label>
          <textarea
            id={`${ids}-message`}
            rows={2}
            maxLength={500}
            value={messageValue}
            onChange={(event) => {
              setMessageEdited(true)
              set({ message: event.target.value })
            }}
            className={cn(FIELD, 'mt-1 w-full resize-none')}
          />
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            {messageEdited ? 'This is what the email will say.' : 'Edit it, or leave it as is.'}
          </p>
        </Collapse>
        {/* Collapses away as the field grows in. The two run concurrently, so the block's height
            moves straight from the one-line link to the textarea instead of stepping. */}
        <Collapse open={!messageOpen}>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            className="text-[12px] font-medium text-[var(--color-accent)] hover:underline"
          >
            + Add a custom message
          </button>
        </Collapse>
      </div>

      {/* The picker has no seconds, so choosing the minute that is already half over produces a
          time in the past — which the scheduler reads as "overdue, send now" and emails within the
          minute. Caught here rather than explained by a surprise email. */}
      {pastOneTime ? (
        <Notice tone="danger" className="mt-3">
          That time has passed — this would send straight away.
        </Notice>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="subtle" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving || pastOneTime}
        >
          {saving ? 'Saving…' : 'Save reminder'}
        </Button>
      </div>
    </div>
  )
}
