// Triggered every minute by pg_cron (see the reminder-cron migrations). Finds reminders whose
// next_run_at has arrived, emails the owning user from the project's Gmail account over SMTP, and
// asks the database to re-arm each one. Deployed with --no-verify-jwt since the caller is our own
// cron job, not a signed-in user; a shared header secret guards it instead.
//
// Who the mail comes from is entirely two Supabase function secrets, GMAIL_USER and
// GMAIL_APP_PASSWORD — no address is written down here. Changing the sender is
// `supabase secrets set GMAIL_USER=... GMAIL_APP_PASSWORD=...` and nothing else.
//
// The two have to move together. Gmail's SMTP will not send as an address it did not authenticate
// as: give it a From that isn't the account (or one of its verified aliases) and it silently
// rewrites the header back to the account, so a half-done switch looks like it worked and doesn't.
//
// This is only the reminder mail. Confirmation and password-reset messages are sent by Supabase
// Auth, which has its own SMTP settings in the dashboard and never reaches this file.
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
//
// What changed when items gained per-item privacy:
//
//   A message used to go to one person, found by joining to the folder and taking its creator. It now
//   goes to the item's *audience*: everybody who can currently reach it, which for a note shared with
//   two people is three messages and for a private one is a single message to its owner. The list is
//   `recipients` on each queue row, computed by public.notification_recipients when the queue is
//   read — so it reflects the sharing state at the moment of sending rather than whenever the
//   reminder was configured.
//
//   Nothing here decides who gets mail. Every address arrives from the database and is re-approved
//   by public.notification_allowed in the instant before its message is written. That is deliberate:
//   the requirement is that a malicious or mistaken sender cannot add a recipient, so the sender is
//   built so that it has no way to. Its only power over the list is to drop names from it.
//
//   It also fixes a real bug. The old join took `f.user_id`, the folder's creator — right in a
//   personal workspace, wrong in a shared one, where a reminder somebody set on a shared note was
//   emailed to whoever happened to have made the folder instead of to them.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
/** The name beside the address in an inbox. Overridable, but it should almost always be the app. */
const MAIL_FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'Mindstack'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? ''

type ReminderKind = 'one_time' | 'recurring' | 'relative'

type Lifecycle = 'note' | 'upcoming' | 'completed_on_time' | 'overdue' | 'completed_late'

/**
 * One person the database says may currently be told about an item.
 *
 * Computed by public.notification_recipients at the moment the queue is read: the item's audience
 * under its present visibility, minus anyone whose preferences turn this class of message off. The
 * list is never stored, and this function never adds to it — see the note above sendTo.
 */
interface Recipient {
  userId: string
  email: string
  timezone: string | null
  name: string | null
}

interface TaskEmailRow {
  task_id: string
  reason: 'completed' | 'due_passed'
  title: string
  due_at: string | null
  completed_at: string | null
  folder_id: string
  user_id: string
  space_id: string | null
  lifecycle: Lifecycle
  has_reminders: boolean
  recipients: Recipient[]
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
  space_id: string | null
  recipients: Recipient[]
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
 * A span of time as a person would describe it: "2 days 4 hours", "18 minutes".
 *
 * Distinct from humanizeMinutes, which names a lead time someone chose from a list and so is
 * always a whole number of days, hours or minutes. This measures a gap nobody picked — the
 * distance between when something was due and when it was actually finished — so it has to carry
 * a remainder. Minutes are dropped once the gap runs to days, where they are noise.
 */
function humanizeGap(ms: number): string {
  const totalMinutes = Math.round(Math.abs(ms) / 60_000)
  if (totalMinutes < 1) {
    return 'less than a minute'
  }
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days} day${days === 1 ? '' : 's'}`)
  }
  if (hours > 0) {
    parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  }
  if (minutes > 0 && days === 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  }
  return parts.join(' ') || 'less than a minute'
}

/**
 * What each of the two task emails says.
 *
 * Returns null where there is nothing worth sending: a deadline arriving on a task nobody
 * finished is not news — the reminders already covered that, and the app is showing it in red.
 * The row is still marked handled by the caller, which is what keeps the queue draining.
 */
interface EmailContent {
  eyebrow: string
  body: string
  metaLabel: string | null
  metaValue: string | null
}

function taskEmailContent(
  row: TaskEmailRow,
  dueLabel: string | null,
  completedLabel: string | null,
): EmailContent | null {
  // How far from the deadline the tick actually landed. "Before" and "after" are already settled
  // by the lifecycle, so only the size of the gap is needed here.
  const gap =
    row.due_at && row.completed_at
      ? humanizeGap(new Date(row.completed_at).getTime() - new Date(row.due_at).getTime())
      : null

  if (row.reason === 'completed') {
    if (row.lifecycle === 'completed_on_time') {
      return {
        eyebrow: 'Completed on time',
        body: gap
          ? `Nice — you finished ${row.title} ${gap} before it was due.`
          : `Nice — you finished ${row.title} on time.`,
        metaLabel: 'Completed',
        metaValue: completedLabel,
      }
    }
    return {
      eyebrow: 'Completed late',
      body: gap
        ? `${row.title} is done — ${gap} after it was due.`
        : `${row.title} is done, after its deadline.`,
      metaLabel: 'Completed',
      metaValue: completedLabel,
    }
  }

  // The deadline has arrived.
  if (row.lifecycle === 'completed_on_time') {
    return {
      eyebrow: 'Deadline reached',
      body: gap
        ? `${row.title} is due now — and you finished it ${gap} ahead. Nicely done.`
        : `${row.title} is due now — and you had already finished it. Nicely done.`,
      metaLabel: 'Due',
      metaValue: dueLabel,
    }
  }

  // Unfinished. Its own reminders are the notification where it has any; where it has none, this
  // is the only thing that will ever say the deadline came and went.
  if (!row.has_reminders) {
    return {
      eyebrow: 'Due now',
      body: dueLabel
        ? `${row.title} was due ${dueLabel} and is still open.`
        : `${row.title} is due now and is still open.`,
      metaLabel: 'Due',
      metaValue: dueLabel,
    }
  }
  return null
}

/**
 * The one envelope every message is rendered into.
 *
 * A white header with the wordmark rather than a solid indigo band: the colour now does one job —
 * the label, the meta rule and the button — instead of shouting from the top of every message.
 *
 * Still inline styles only, still no <style> block, still nothing dangling at the end of a line
 * (see escapeHtml's note). The logo bars are inline-block spans with a background colour, which is
 * the one drawing primitive Gmail reliably keeps; an inline SVG would be stripped.
 */
/**
 * The one envelope every message is rendered into.
 *
 * Brand assets are the real ones, not approximations. The mark is public/email-logo.png — the same
 * seven-bar logo the app draws, flattened to the brand indigo and rasterised, because Gmail does
 * not render SVG in an <img> at all and an earlier attempt to rebuild it from styled spans
 * produced four evenly spaced bars that also broke onto their own line. The header is a table for
 * the same reason: it is the one layout primitive every client agrees on.
 *
 * The typefaces are the app's own — Sansita for display, Inter for text. The @import reaches the
 * clients that honour a <style> block (Apple Mail, iOS); Gmail strips it and falls through to the
 * stacks, which is why every family below still names real fallbacks.
 */
/**
 * Where the mark is fetched from.
 *
 * Supabase Storage rather than the web app's own public/ folder: this pipeline runs entirely
 * inside Supabase, and pinning the logo to a Vercel deploy would mean a reminder sent on Tuesday
 * losing its branding because a front-end deploy slipped to Wednesday. Derived from SUPABASE_URL
 * so it follows the project rather than being written down twice.
 */
const LOGO_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/brand/email-logo.png`
  : null

const DISPLAY_FONT = "'Sansita','Iowan Old Style',Georgia,serif"
const BODY_FONT = "'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif"

function buildReminderEmailHtml(args: {
  title: string
  body: string
  eyebrow: string
  /** The small caps word before the dot, e.g. "Due" or "Completed". */
  metaLabel: string | null
  metaValue: string | null
  taskLink: string | null
  /** Something that differs between any two messages — see the preheader below. */
  traceId: string
}): string {
  const { title, body, eyebrow, metaLabel, metaValue, taskLink, traceId } = args
  const logoSrc = LOGO_URL

  const rows = [
    "<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sansita:wght@700;800&display=swap');</style>",

    /*
     * The preheader: the line an inbox shows beside the subject, and the reason Gmail stops
     * folding these away.
     *
     * Two jobs in one hidden block. It gives the list preview a real sentence instead of whatever
     * visible text happens to come first. And it carries a value that differs between any two
     * messages, which is what defeats Gmail's "trimmed content" heuristic — that collapses a
     * message whose markup matches one already shown in the same thread, and every one of these
     * shares a byte-identical header and footer, so a second reminder on the same note arrived
     * with everything below the logo hidden behind a "..." button.
     *
     * The zero-width joiners after it stop the body text being pulled into the preview alongside.
     */
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">',
    escapeHtml(body),
    `<span>&#8204;&#847;&nbsp;${escapeHtml(traceId)}</span>`,
    '&#8204;&nbsp;'.repeat(60),
    '</div>',
    '<div style="background-color:#f0f0f4;padding:32px 16px;">',
    `<div style="max-width:520px;margin:0 auto;background-color:#ffffff;border:1px solid #e4e4ec;border-radius:14px;overflow:hidden;font-family:${BODY_FONT};">`,

    // Header: the mark and the wordmark on one row. A table, because inline-block spans wrapped.
    '<div style="padding:18px 28px;border-bottom:1px solid #ececf2;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    logoSrc
      // alt is empty on purpose: the wordmark sits right beside it, so a blocked image should
      // leave the name once rather than printing it twice.
      ? `<td style="vertical-align:middle;padding-right:9px;"><img src="${logoSrc}" width="29" height="20" alt="" style="display:block;border:0;outline:none;text-decoration:none;"></td>`
      : '',
    `<td style="vertical-align:middle;"><span style="font-family:${DISPLAY_FONT};font-size:20px;font-weight:800;letter-spacing:-0.01em;color:#14161a;">Mindstack</span></td>`,
    '</tr></table>',
    '</div>',

    '<div style="padding:26px 28px 28px 28px;">',

    // The label, dotted, in the accent. This is the same word the subject line starts with.
    `<p style="margin:0 0 10px 0;font-family:${BODY_FONT};font-size:11.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#4f46e5;">`,
    '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:#4f46e5;vertical-align:middle;margin-right:7px;"></span>',
    escapeHtml(eyebrow),
    '</p>',

    `<h1 style="margin:0 0 12px 0;font-family:${DISPLAY_FONT};font-size:28px;line-height:1.25;font-weight:800;letter-spacing:-0.01em;color:#14161a;">${escapeHtml(title)}</h1>`,
    `<p style="margin:0 0 20px 0;font-family:${BODY_FONT};font-size:15.5px;line-height:1.55;color:#434852;">${escapeHtml(body)}</p>`,

    // A quiet rule of facts rather than a filled pill — the sentence above already carries the
    // message, so the date is reference rather than emphasis.
    metaLabel && metaValue
      ? `<p style="margin:0 0 24px 0;font-family:${BODY_FONT};font-size:13px;line-height:1.5;letter-spacing:0.02em;color:#8a8fa0;">${escapeHtml(metaLabel)} &middot; ${escapeHtml(metaValue)}</p>`
      : '',

    taskLink
      ? `<div><a href="${taskLink}" style="display:inline-block;font-family:${BODY_FONT};background-color:#4f46e5;color:#ffffff;font-size:14.5px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:999px;">Open in Mindstack &rarr;</a></div>`
      : '',
    '</div>',

    '<div style="border-top:1px solid #ececf2;padding:14px 28px;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>',
    // Four of the five messages are not reminders at all: a completion note, or a deadline
    // arriving, is sent because of the deadline rather than because anyone set a reminder.
    `<td style="font-family:${BODY_FONT};font-size:12px;color:#8a8fa0;">You&rsquo;re getting this because of a task in Mindstack.</td>`,
    taskLink
      ? `<td align="right" style="font-family:${BODY_FONT};font-size:12px;white-space:nowrap;"><a href="${taskLink}" style="color:#8a8fa0;">Manage reminders</a></td>`
      : '',
    '</tr></table>',
    '</div>',

    '</div>',
    '</div>',
  ]
  return rows.join('')
}

function buildReminderEmailText(args: {
  body: string
  metaLabel: string | null
  metaValue: string | null
  taskLink: string | null
}): string {
  const lines = [args.body]
  if (args.metaLabel && args.metaValue) {
    lines.push(`${args.metaLabel} - ${args.metaValue}`)
  }
  if (args.taskLink) {
    lines.push(`Open in Mindstack: ${args.taskLink}`)
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
      'id,task_id,kind,message,timezone,next_run_at,offset_minutes,offset_direction,title,due_at,folder_id,note_kind,user_id,space_id,recipients',
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
    .select(
      'task_id,reason,title,due_at,completed_at,folder_id,user_id,space_id,lifecycle,has_reminders,recipients',
    )
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

  /*
   * "Mindstack <support@…>" rather than the bare address.
   *
   * The account this authenticates as is a support mailbox, not a person, and an inbox showing a
   * raw gmail address next to a subject line reads like something that escaped rather than
   * something the app sent. The address still has to be GMAIL_USER — see the note at the top
   * about Gmail rewriting a From it did not authenticate as — so only the display name is ours to
   * choose. Quoted, because a name carrying a comma or a full stop is not a valid bare atom and
   * would split the header.
   */
  const mailFrom = `"${MAIL_FROM_NAME.replace(/["\\]/g, '')}" <${GMAIL_USER}>`

  /**
   * The mail connection, opened on the first message that actually needs it.
   *
   * It used to be opened as soon as either queue had a row, which is not the same thing: a
   * deadline passing on a task that warrants no email still puts a row in the queue, so the
   * function dialled Gmail, sent nothing and hung up. Every one of those runs logged a real
   * error — "Interrupted: operation canceled at Object.pull" — because the isolate wound down
   * while the SMTP socket still had a read pending.
   *
   * Connecting only when there is something to send makes those runs do nothing at all, which is
   * what they were always meant to do.
   */
  let client: SMTPClient | null = null
  const smtp = (): SMTPClient => {
    client ??= new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
    })
    return client
  }

  let sent = 0
  const failures: string[] = []
  /** Messages not sent because the recipient no longer had access by the time we got to them. */
  let denied = 0

  /**
   * The last thing between a computed recipient and an actual email.
   *
   * The queue view already filtered by access and preference, so this looks redundant — and it is
   * not, for one reason: the view is read once at the top of a run that then spends however long it
   * takes to talk to an SMTP server, one message at a time. Access can be withdrawn during that
   * window. Asking again immediately before each send is what makes "authorization is checked at
   * the exact moment the notification executes" literally true instead of nearly true.
   *
   * It is also the only place a recipient list is ever *narrowed* and never widened. Nothing in this
   * file can add an address: every candidate comes from the database, and each one has to be
   * re-approved by the database before anything leaves. A compromised or mistaken sender can fail to
   * deliver, but it cannot deliver somewhere it should not.
   */
  const allowed = async (
    recipient: Recipient,
    taskId: string,
    kind: 'reminders' | 'due_dates',
  ): Promise<boolean> => {
    const { data, error: checkError } = await supabase.rpc('notification_allowed', {
      p_user_id: recipient.userId,
      p_entity_type: 'task',
      p_entity_id: taskId,
      p_class: kind,
    })
    if (checkError) {
      // Cannot confirm the recipient still has access, so do not send. A missed notification is
      // recoverable on the next sweep; a notification to somebody who lost access is not.
      failures.push(`${taskId}: could not verify access for a recipient (${checkError.message})`)
      return false
    }
    return data === true
  }

  for (const reminder of rows) {
    const recipients = reminder.recipients ?? []
    const taskLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/task/${reminder.task_id}` : null
    let delivered = 0
    let attempted = 0

    for (const recipient of recipients) {
      if (!recipient.email) {
        continue
      }
      if (!(await allowed(recipient, reminder.task_id, 'reminders'))) {
        denied += 1
        continue
      }
      attempted += 1

      // The reminder's own zone is the one the schedule was written in; the recipient's account zone
      // is the fallback for reminders created before zones were stored per row. Resolved per person
      // now that a reminder can reach several: a deadline should read in the reader's own clock.
      const zone = reminder.timezone ?? recipient.timezone ?? undefined
      // A deadline is only worth printing when the note actually has one — a repeating reminder on
      // a plain note has nothing to show here.
      const dueLabel =
        reminder.note_kind === 'due_task' && reminder.due_at
          ? formatDue(reminder.due_at, zone)
          : null
      const body = reminderMessage(reminder, dueLabel)

      try {
        await smtp().send({
          from: mailFrom,
          to: recipient.email,
          subject: `Reminder: ${reminder.title}`,
          content: buildReminderEmailText({ body, metaLabel: 'Due', metaValue: dueLabel, taskLink }),
          html: buildReminderEmailHtml({
            title: reminder.title,
            body,
            eyebrow: 'Reminder',
            metaLabel: 'Due',
            metaValue: dueLabel,
            taskLink,
            // The reminder, the moment it fired and who it went to: no two of these messages carry
            // the same markup, which is what stops Gmail folding them into one another.
            traceId: `${reminder.id}:${reminder.next_run_at}:${recipient.userId}`,
          }),
        })
        delivered += 1
      } catch (sendError) {
        failures.push(
          `${reminder.id} -> ${recipient.email}: ${
            sendError instanceof Error ? sendError.message : String(sendError)
          }`,
        )
      }
    }

    /*
     * Re-arm once, for the reminder rather than per message.
     *
     * Marked when at least one message went out, and also when there was nobody to tell — a reminder
     * on a note whose audience has emptied is finished, and leaving it armed would have it examined
     * every minute forever. Not marked when there were recipients and every send failed: that is a
     * transient mail problem, and the next sweep should try again.
     */
    if (delivered > 0 || attempted === 0) {
      const { error: markError } = await supabase.rpc('mark_reminder_sent', {
        p_reminder_id: reminder.id,
      })
      if (markError) {
        failures.push(`${reminder.id}: sent but failed to re-arm (${markError.message})`)
      } else {
        sent += delivered
      }
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
    const recipients = row.recipients ?? []
    const taskLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/task/${row.task_id}` : null
    let delivered = 0
    let attempted = 0

    for (const recipient of recipients) {
      if (!recipient.email) {
        continue
      }
      if (!(await allowed(recipient, row.task_id, 'due_dates'))) {
        denied += 1
        continue
      }

      // Per recipient, so a shared deadline reads in each reader's own clock.
      const zone = recipient.timezone ?? undefined
      const dueLabel = row.due_at ? formatDue(row.due_at, zone) : null
      const completedLabel = row.completed_at ? formatDue(row.completed_at, zone) : null
      const content = taskEmailContent(row, dueLabel, completedLabel)
      if (!content) {
        // Nothing worth saying to anybody — the decision does not depend on who is reading, so the
        // whole row is finished. Marked below by attempted staying at zero.
        break
      }
      attempted += 1

      try {
        await smtp().send({
          from: mailFrom,
          to: recipient.email,
          subject: `${content.eyebrow}: ${row.title}`,
          content: buildReminderEmailText({
            body: content.body,
            metaLabel: content.metaLabel,
            metaValue: content.metaValue,
            taskLink,
          }),
          html: buildReminderEmailHtml({
            title: row.title,
            body: content.body,
            eyebrow: content.eyebrow,
            metaLabel: content.metaLabel,
            metaValue: content.metaValue,
            taskLink,
            traceId: `${row.task_id}:${row.reason}:${row.completed_at ?? row.due_at ?? ''}:${recipient.userId}`,
          }),
        })
        delivered += 1
      } catch (sendError) {
        failures.push(
          `${row.task_id} (${row.reason}) -> ${recipient.email}: ${
            sendError instanceof Error ? sendError.message : String(sendError)
          }`,
        )
      }
    }

    /*
     * Every row is marked handled, including the ones with nothing to say — a deadline passing on an
     * unfinished task is already covered by its reminders, and leaving it unmarked would mean
     * re-examining it every minute forever. The one case that is *not* marked is the same as for
     * reminders: there were people to tell and the mail server refused every one of them.
     */
    if (delivered > 0 || attempted === 0) {
      const { error: markError } = await supabase.rpc('mark_task_email_sent', {
        p_task_id: row.task_id,
        p_reason: row.reason,
      })
      if (markError) {
        failures.push(`${row.task_id} (${row.reason}): failed to mark (${markError.message})`)
      } else if (delivered > 0) {
        taskSent += delivered
      } else {
        taskSkipped += 1
      }
    }
  }

  // Only if one was ever opened — and a failure to hang up cleanly is not a failure to deliver.
  // By this point the mail has been accepted by Gmail and marked as sent.
  if (client) {
    try {
      await client.close()
    } catch {
      /* The connection is being discarded anyway. */
    }
  }

  return new Response(
    JSON.stringify({
      checked: rows.length + taskEmails.length,
      sent: sent + taskSent,
      skipped: taskSkipped,
      // Recipients the queue offered and the pre-send check refused. Reported rather than silent:
      // a number that is always zero is a check nobody would notice had stopped working, and a
      // number that climbs is how a revocation is seen to have taken effect.
      denied,
      failures,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
