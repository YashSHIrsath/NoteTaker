// Triggered every minute by pg_cron (see the reminder-cron migrations). Finds reminders whose
// next_run_at has arrived, emails the owning user via their own Gmail account over SMTP, and asks
// the database to re-arm each one. Deployed with --no-verify-jwt since the caller is our own cron
// job, not a signed-in user; a shared header secret guards it instead.
//
// What changed when reminders became their own table:
//
//   This used to read pending_task_reminders — one reminder per task, always "due_at minus N
//   minutes" — and stamp tasks.reminder_sent_at to stop a resend. It now reads due_reminders, so
//   a task can have several reminders that fire independently, and a reminder can exist on a note
//   that has no deadline at all.
//
//   Working out when a repeating reminder next fires is deliberately NOT done here. It happens in
//   mark_reminder_sent, next to the clock and the stored timezone, so "every second Monday" is
//   answered the same way whether it was this function, a trigger, or a hand-run query that asked.
//   This function's whole job is: read the queue, write an email, report the send.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? ''

type ReminderKind = 'one_time' | 'recurring' | 'relative'

type Lifecycle = 'note' | 'upcoming' | 'completed_on_time' | 'overdue' | 'completed_late'

interface TaskEmailRow {
  task_id: string
  reason: 'completed' | 'due_passed'
  title: string
  due_at: string | null
  completed_at: string | null
  folder_id: string
  user_id: string
  lifecycle: Lifecycle
}

interface DueReminderRow {
  id: string
  task_id: string
  kind: ReminderKind
  message: string | null
  timezone: string | null
  next_run_at: string
  offset_minutes: number | null
  offset_direction: 'before' | 'after' | null
  title: string
  due_at: string | null
  folder_id: string
  note_kind: string
  user_id: string
}

// The function's own runtime has no notion of the user's timezone (it defaults to UTC), so
// without an explicit IANA zone here the email would show the due time converted to the server's
// clock instead of the user's. The reminder carries the zone it was created in, which is a better
// answer than the account-wide one: a reminder set while travelling means the time you meant then.
function formatDue(iso: string, timeZone: string | undefined): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  })
}

/** "1 day", "2 hours", "15 minutes" — the lead time as a person would say it. */
function humanizeMinutes(minutes: number): string {
  if (minutes <= 0) {
    return 'now'
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return `${days} day${days === 1 ? '' : 's'}`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

/**
 * What the email actually says.
 *
 * A reminder the user wrote a message for says that message and nothing else — it is the whole
 * reason the field exists. Everything else gets a sentence built from what the reminder is: a
 * lead time if it has one, the deadline if there is one, and the task's name if that is all there
 * is (a repeating reminder on a plain note has no deadline to talk about).
 */
function reminderMessage(row: DueReminderRow, dueLabel: string | null): string {
  const custom = row.message?.trim()
  if (custom) {
    return custom
  }
  if (row.kind === 'relative' && row.offset_minutes !== null) {
    if (row.offset_minutes === 0) {
      return `${row.title} is due now.`
    }
    const lead = humanizeMinutes(row.offset_minutes)
    return row.offset_direction === 'after'
      ? `${row.title} was due ${lead} ago.`
      : `${row.title} is due in ${lead}.`
  }
  if (dueLabel) {
    return `${row.title} is due ${dueLabel}.`
  }
  return `A reminder about ${row.title}.`
}

// Inline styles only — many email clients strip <style> blocks. Colors are lifted directly from
// src/index.css's light theme (email clients don't reliably support CSS variables or
// prefers-color-scheme), and every line is built with no leading/trailing whitespace before a
// line break, since a stray trailing space before a newline is exactly what a quoted-printable
// encoder escapes as a literal "=20" — which is what showed up in the first version of this email.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * What each of the two task emails says.
 *
 * Returns null where there is nothing worth sending: a deadline arriving on a task nobody
 * finished is not news — the reminders already covered that, and the app is showing it in red.
 * The row is still marked handled by the caller, which is what keeps the queue draining.
 */
function taskEmailContent(
  row: TaskEmailRow,
  dueLabel: string | null,
): { eyebrow: string; body: string } | null {
  if (row.reason === 'completed') {
    if (row.lifecycle === 'completed_on_time') {
      return {
        eyebrow: 'Completed on time',
        body: dueLabel
          ? `Nice — you finished ${row.title} before it was due on ${dueLabel}.`
          : `Nice — you finished ${row.title} on time.`,
      }
    }
    return {
      eyebrow: 'Completed late',
      body: dueLabel
        ? `${row.title} is done. It was due ${dueLabel}, so this one came in late.`
        : `${row.title} is done, after its deadline.`,
    }
  }

  // The deadline has arrived. Worth saying only when it was beaten.
  if (row.lifecycle === 'completed_on_time') {
    return {
      eyebrow: 'Deadline reached',
      body: `${row.title} was due ${dueLabel ?? 'now'} — and you had already finished it. Nicely done.`,
    }
  }
  return null
}

function buildReminderEmailHtml(
  title: string,
  body: string,
  dueLabel: string | null,
  taskLink: string | null,
  eyebrow = 'Reminder',
): string {
  const rows = [
    '<div style="background-color:#f8f9fb;padding:32px 16px;">',
    '<div style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #e6e8ec;border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Helvetica Neue,Arial,sans-serif;">',
    '<div style="background-color:#4f46e5;padding:20px 28px;">',
    '<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">Mindstack</span>',
    '</div>',
    '<div style="padding:32px 28px 28px 28px;">',
    `<p style="margin:0 0 6px 0;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#6b7180;">${escapeHtml(eyebrow)}</p>`,
    `<h1 style="margin:0 0 14px 0;font-size:26px;line-height:1.3;font-weight:700;color:#14161a;">${escapeHtml(title)}</h1>`,
    `<p style="margin:0 0 22px 0;font-size:16px;line-height:1.55;color:#3b4048;">${escapeHtml(body)}</p>`,
    dueLabel
      ? `<div style="display:inline-block;background-color:#eef1ff;color:#372f9e;font-size:15px;font-weight:600;padding:8px 16px;border-radius:999px;margin-bottom:26px;">Due ${escapeHtml(dueLabel)}</div>`
      : '',
    taskLink
      ? `<div><a href="${taskLink}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;">Open in Mindstack</a></div>`
      : '',
    '</div>',
    '<div style="border-top:1px solid #e6e8ec;padding:16px 28px;">',
    '<p style="margin:0;font-size:12.5px;color:#6b7180;">You\'re getting this because you set a reminder for this note in Mindstack.</p>',
    '</div>',
    '</div>',
    '</div>',
  ]
  return rows.join('')
}

function buildReminderEmailText(body: string, dueLabel: string | null, taskLink: string | null): string {
  const lines = [body]
  if (dueLabel) {
    lines.push(`Due ${dueLabel}.`)
  }
  if (taskLink) {
    lines.push(`Open in Mindstack: ${taskLink}`)
  }
  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return new Response('Missing required secrets.', { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: dueRows, error } = await supabase
    .from('due_reminders')
    .select(
      'id,task_id,kind,message,timezone,next_run_at,offset_minutes,offset_direction,title,due_at,folder_id,note_kind,user_id',
    )
    .lte('next_run_at', new Date().toISOString())
    .order('next_run_at', { ascending: true })
    .limit(100)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const rows = (dueRows ?? []) as DueReminderRow[]

  // The second queue: messages about the task rather than about a reminder. Read before the SMTP
  // connection is opened so a run with nothing to do never opens one.
  const { data: taskRows, error: taskError } = await supabase
    .from('pending_task_emails')
    .select('task_id,reason,title,due_at,completed_at,folder_id,user_id,lifecycle')
    .limit(100)

  if (taskError) {
    return new Response(JSON.stringify({ error: taskError.message }), { status: 500 })
  }

  const taskEmails = (taskRows ?? []) as TaskEmailRow[]

  if (rows.length === 0 && taskEmails.length === 0) {
    return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  })

  interface UserInfo {
    email: string | null
    timezone: string | undefined
  }

  const userCache = new Map<string, UserInfo>()
  const getUserInfo = async (userId: string): Promise<UserInfo> => {
    const cached = userCache.get(userId)
    if (cached) {
      return cached
    }
    const { data, error: userError } = await supabase.auth.admin.getUserById(userId)
    const metadata = (data?.user?.user_metadata ?? {}) as { timezone?: string }
    const info: UserInfo = {
      email: !userError ? data.user?.email ?? null : null,
      timezone: typeof metadata.timezone === 'string' ? metadata.timezone : undefined,
    }
    userCache.set(userId, info)
    return info
  }

  let sent = 0
  const failures: string[] = []

  for (const reminder of rows) {
    const { email, timezone: accountZone } = await getUserInfo(reminder.user_id)
    if (!email) {
      failures.push(`${reminder.id}: no owner email`)
      continue
    }

    // The reminder's own zone is the one the schedule was written in; the account's is the
    // fallback for reminders created before zones were stored per row.
    const zone = reminder.timezone ?? accountZone
    // A deadline is only worth printing when the note actually has one — a repeating reminder on
    // a plain note has nothing to show here.
    const dueLabel =
      reminder.note_kind === 'due_task' && reminder.due_at ? formatDue(reminder.due_at, zone) : null
    const taskLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/task/${reminder.task_id}` : null
    const body = reminderMessage(reminder, dueLabel)

    try {
      await client.send({
        from: GMAIL_USER,
        to: email,
        subject: `Reminder: ${reminder.title}`,
        content: buildReminderEmailText(body, dueLabel, taskLink),
        html: buildReminderEmailHtml(reminder.title, body, dueLabel, taskLink),
      })
      // Records the send and computes the next occurrence in one statement. A failure here means
      // the mail went out but the reminder is still armed, so it is reported rather than
      // swallowed — a repeat is the visible symptom.
      const { error: markError } = await supabase.rpc('mark_reminder_sent', {
        p_reminder_id: reminder.id,
      })
      if (markError) {
        failures.push(`${reminder.id}: sent but failed to re-arm (${markError.message})`)
      } else {
        sent += 1
      }
    } catch (sendError) {
      failures.push(
        `${reminder.id}: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
      )
    }
  }

  /**
   * Completion and deadline-reached messages.
   *
   * Every row is marked handled, including the ones with nothing to say — a deadline passing on an
   * unfinished task is already covered by its reminders, and leaving it unmarked would mean
   * re-examining it every minute forever.
   */
  let taskSent = 0
  let taskSkipped = 0

  for (const row of taskEmails) {
    const { email, timezone } = await getUserInfo(row.user_id)
    const dueLabel = row.due_at ? formatDue(row.due_at, timezone) : null
    const content = taskEmailContent(row, dueLabel)

    if (!email || !content) {
      const { error: markError } = await supabase.rpc('mark_task_email_sent', {
        p_task_id: row.task_id,
        p_reason: row.reason,
      })
      if (markError) {
        failures.push(`${row.task_id} (${row.reason}): ${markError.message}`)
      } else {
        taskSkipped += 1
      }
      continue
    }

    const taskLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/task/${row.task_id}` : null

    try {
      await client.send({
        from: GMAIL_USER,
        to: email,
        subject: `${content.eyebrow}: ${row.title}`,
        content: buildReminderEmailText(content.body, dueLabel, taskLink),
        html: buildReminderEmailHtml(row.title, content.body, dueLabel, taskLink, content.eyebrow),
      })
      const { error: markError } = await supabase.rpc('mark_task_email_sent', {
        p_task_id: row.task_id,
        p_reason: row.reason,
      })
      if (markError) {
        failures.push(`${row.task_id} (${row.reason}): sent but failed to mark (${markError.message})`)
      } else {
        taskSent += 1
      }
    } catch (sendError) {
      failures.push(
        `${row.task_id} (${row.reason}): ${sendError instanceof Error ? sendError.message : String(sendError)}`,
      )
    }
  }

  await client.close()

  return new Response(
    JSON.stringify({
      checked: rows.length + taskEmails.length,
      sent: sent + taskSent,
      skipped: taskSkipped,
      failures,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
