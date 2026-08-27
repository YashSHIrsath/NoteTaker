import type { Reminder, ReminderDraft, TaskEvent } from '../types'
import { RepositoryError } from './errors'
import type { RemindersDataRepository } from './types'

/**
 * The no-backend fallback, for the LocalStorage mode the app still supports when Supabase isn't
 * configured.
 *
 * Reminders are stored so the UI behaves — you can add, edit and delete them and they persist
 * across a reload — but nothing will ever send one. That is not a gap to paper over: a reminder is
 * an email that arrives while the app is closed, and there is no server here to send it. The
 * dialog says as much rather than letting someone set a 6am alarm that silently does nothing.
 *
 * `nextRunAt` stays null for the same reason. Computing it would be inventing a schedule nobody
 * will run.
 */
const STORAGE_KEY = 'mindstack.reminders.v1'

function read(): Reminder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Reminder[]) : []
  } catch {
    return []
  }
}

function write(reminders: Reminder[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders))
  } catch {
    /* Quota or a private window: the UI keeps working for this session. */
  }
}

function fromDraft(id: string, taskId: string, draft: ReminderDraft): Reminder {
  return {
    id,
    taskId,
    kind: draft.kind,
    message: draft.message,
    isActive: draft.isActive,
    timezone: draft.timezone,
    atUtc: draft.atUtc,
    recurUnit: draft.recurUnit,
    recurInterval: draft.recurInterval,
    recurWeekday: draft.recurWeekday,
    recurTime: draft.recurTime,
    anchorDate: draft.anchorDate,
    offsetMinutes: draft.offsetMinutes,
    offsetDirection: draft.offsetDirection,
    nextRunAt: null,
    lastRunAt: null,
  }
}

export class LocalRemindersDataRepository implements RemindersDataRepository {
  listAll(): Reminder[] {
    return read()
  }

  create(taskId: string, draft: ReminderDraft): Reminder {
    const reminder = fromDraft(crypto.randomUUID(), taskId, draft)
    write([...read(), reminder])
    return reminder
  }

  update(reminderId: string, draft: ReminderDraft, taskId: string): Reminder {
    const updated = fromDraft(reminderId, taskId, draft)
    const next = read().map((reminder) => (reminder.id === reminderId ? updated : reminder))
    if (!next.some((reminder) => reminder.id === reminderId)) {
      throw new RepositoryError('Could not save the reminder.')
    }
    write(next)
    return updated
  }

  setActive(reminderId: string, isActive: boolean): Reminder {
    const next = read().map((reminder) =>
      reminder.id === reminderId ? { ...reminder, isActive } : reminder,
    )
    const found = next.find((reminder) => reminder.id === reminderId)
    if (!found) {
      throw new RepositoryError('Could not update the reminder.')
    }
    write(next)
    return found
  }

  /** No history without a server to write it: the log is produced by database triggers, and there
   *  are none here. An empty list is the truth rather than a gap. */
  listEvents(): TaskEvent[] {
    return []
  }

  remove(reminderId: string): void {
    write(read().filter((reminder) => reminder.id !== reminderId))
  }
}
