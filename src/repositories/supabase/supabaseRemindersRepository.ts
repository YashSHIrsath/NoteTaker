import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabase'
import type { Reminder, ReminderDraft, TaskEvent, TaskEventKind } from '../../types'
import { RepositoryError, toRepositoryError } from '../errors'
import type { RemindersDataRepository } from '../types'

/**
 * Reminders talk to Supabase directly, one row at a time.
 *
 * Everything else in this app is saved as one document: FolderContext holds every folder, task and
 * subtask in memory and `save()` upserts the lot, then deletes any row the snapshot doesn't
 * mention. That is a reasonable shape for a note tree, and a dangerous one for reminders — a
 * reminder created in another tab, or the `next_run_at` the scheduler just wrote, would be "not in
 * the snapshot" and get swept away.
 *
 * So reminders are their own repository with ordinary CRUD, and the snapshot never sees them. It
 * also means a reminder is saved the moment it is added rather than riding along with whatever
 * else happened to be dirty.
 */
export interface ReminderRow {
  id: string
  task_id: string
  kind: string
  message: string | null
  is_active: boolean
  timezone: string
  at_utc: string | null
  recur_unit: string | null
  recur_interval: number | null
  recur_weekday: number | null
  recur_time: string | null
  anchor_date: string | null
  offset_minutes: number | null
  offset_direction: string | null
  next_run_at: string | null
  last_run_at: string | null
}

const REMINDER_COLUMNS =
  'id,task_id,kind,message,is_active,timezone,at_utc,recur_unit,recur_interval,recur_weekday,recur_time,anchor_date,offset_minutes,offset_direction,next_run_at,last_run_at'

function isKind(value: string): value is Reminder['kind'] {
  return value === 'one_time' || value === 'recurring' || value === 'relative'
}

export function reminderFromRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: isKind(row.kind) ? row.kind : 'one_time',
    message: row.message,
    isActive: row.is_active,
    timezone: row.timezone,
    atUtc: row.at_utc,
    recurUnit: row.recur_unit === 'day' || row.recur_unit === 'week' ? row.recur_unit : null,
    recurInterval: row.recur_interval,
    recurWeekday: row.recur_weekday,
    // Postgres hands back `time` as HH:MM:SS; the pickers and the labels both want HH:MM.
    recurTime: row.recur_time ? row.recur_time.slice(0, 5) : null,
    anchorDate: row.anchor_date,
    offsetMinutes: row.offset_minutes,
    offsetDirection:
      row.offset_direction === 'before' || row.offset_direction === 'after'
        ? row.offset_direction
        : null,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
  }
}

/**
 * The columns a client is allowed to write.
 *
 * next_run_at and last_run_at are missing on purpose — they are the scheduler's, computed by
 * `prepare_reminder` on every write and by `mark_reminder_sent` after every send. A browser that
 * could set next_run_at could schedule a send for any time it liked, including one that never
 * arrives; not sending them at all is simpler than validating them.
 */
function draftToRow(draft: ReminderDraft, taskId: string): Record<string, unknown> {
  return {
    task_id: taskId,
    kind: draft.kind,
    message: draft.message,
    is_active: draft.isActive,
    timezone: draft.timezone,
    at_utc: draft.atUtc,
    recur_unit: draft.recurUnit,
    recur_interval: draft.recurInterval,
    recur_weekday: draft.recurWeekday,
    recur_time: draft.recurTime,
    anchor_date: draft.anchorDate,
    offset_minutes: draft.offsetMinutes,
    offset_direction: draft.offsetDirection,
  }
}

interface TaskEventRow {
  id: string
  task_id: string
  kind: string
  occurred_at: string
  previous_at: string | null
  next_at: string | null
  detail: string | null
  reminder_id: string | null
}

const EVENT_KINDS: readonly TaskEventKind[] = [
  'due_set',
  'due_changed',
  'due_cleared',
  'reminder_added',
  'reminder_fired',
  'reminder_removed',
  'completed',
  'reopened',
]

function eventFromRow(row: TaskEventRow): TaskEvent | null {
  // A kind this build doesn't know about comes from a newer migration than this client. Dropping
  // the row is right: history is a list to read, and an entry nobody can render is not one.
  if (!(EVENT_KINDS as readonly string[]).includes(row.kind)) {
    return null
  }
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind as TaskEventKind,
    occurredAt: row.occurred_at,
    previousAt: row.previous_at,
    nextAt: row.next_at,
    detail: row.detail,
    reminderId: row.reminder_id,
  }
}

export class SupabaseRemindersDataRepository implements RemindersDataRepository {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient | null = getSupabaseClient()) {
    if (!client) {
      throw new RepositoryError('Supabase is not configured.')
    }
    this.client = client
  }

  /** Every reminder this account owns, in one read. RLS scopes it; there is no user id to pass. */
  async listAll(): Promise<Reminder[]> {
    try {
      const { data, error } = await this.client
        .from('reminders')
        .select(REMINDER_COLUMNS)
        .order('created_at', { ascending: true })
      if (error) {
        throw toRepositoryError(error, 'Could not load reminders.')
      }
      return ((data ?? []) as ReminderRow[]).map(reminderFromRow)
    } catch (error) {
      throw toRepositoryError(error, 'Could not load reminders.')
    }
  }

  async create(taskId: string, draft: ReminderDraft): Promise<Reminder> {
    try {
      const { data, error } = await this.client
        .from('reminders')
        .insert(draftToRow(draft, taskId))
        .select(REMINDER_COLUMNS)
        .single()
      if (error) {
        throw toRepositoryError(error, 'Could not add the reminder.')
      }
      return reminderFromRow(data as ReminderRow)
    } catch (error) {
      throw toRepositoryError(error, 'Could not add the reminder.')
    }
  }

  /**
   * One task's history, newest first.
   *
   * Capped rather than paged: nobody scrolls a schedule log, and a task edited a thousand times
   * should not hand the browser a thousand rows to render behind a disclosure.
   */
  async listEvents(taskId: string): Promise<TaskEvent[]> {
    try {
      const { data, error } = await this.client
        .from('task_events')
        .select('id,task_id,kind,occurred_at,previous_at,next_at,detail,reminder_id')
        .eq('task_id', taskId)
        .order('occurred_at', { ascending: false })
        .limit(100)
      if (error) {
        throw toRepositoryError(error, 'Could not load this note’s history.')
      }
      return ((data ?? []) as TaskEventRow[])
        .map(eventFromRow)
        .filter((event): event is TaskEvent => event !== null)
    } catch (error) {
      throw toRepositoryError(error, 'Could not load this note’s history.')
    }
  }

  async remove(reminderId: string): Promise<void> {
    try {
      const { error } = await this.client.from('reminders').delete().eq('id', reminderId)
      if (error) {
        throw toRepositoryError(error, 'Could not delete the reminder.')
      }
    } catch (error) {
      throw toRepositoryError(error, 'Could not delete the reminder.')
    }
  }
}
