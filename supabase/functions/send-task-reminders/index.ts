// Triggered on a schedule by pg_cron (see the reminder-cron migration). Finds tasks whose
// reminder is due, emails the owning user via their own Gmail account over SMTP, and marks
// reminder_sent_at so the next run doesn't resend. Deployed with --no-verify-jwt since the
// caller is our own cron job, not a signed-in user; a shared header secret guards it instead.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? ''

interface DueTaskRow {
  id: string
  title: string
  due_at: string
  folder_id: string
  user_id: string
}

// The function's own runtime has no notion of the user's timezone (it defaults to UTC), so
// without an explicit IANA zone here the email would show the due time converted to the
// server's clock instead of the user's — timeZone is stamped into user_metadata whenever a
// due date is set from the app (see TaskEditor's onSave).
function formatDue(iso: string, timeZone: string | undefined): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  })
}

// Inline styles only — many email clients strip <style> blocks. Colors are lifted directly
// from src/index.css's light theme (email clients don't reliably support CSS variables or
// prefers-color-scheme), and every line is built with no leading/trailing whitespace before a
// line break, since a stray trailing space before a newline is exactly what a quoted-printable
// encoder escapes as a literal "=20" — which is what showed up in the first version of this email.
function buildReminderEmailHtml(title: string, dueLabel: string, taskLink: string | null): string {
  const rows = [
    '<div style="background-color:#f8f9fb;padding:32px 16px;">',
    '<div style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #e6e8ec;border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Helvetica Neue,Arial,sans-serif;">',
    '<div style="background-color:#4f46e5;padding:20px 28px;">',
    '<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">Mindstack</span>',
    '</div>',
    '<div style="padding:32px 28px 28px 28px;">',
    '<p style="margin:0 0 6px 0;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#6b7180;">Task reminder</p>',
    `<h1 style="margin:0 0 18px 0;font-size:26px;line-height:1.3;font-weight:700;color:#14161a;">${title}</h1>`,
    `<div style="display:inline-block;background-color:#eef1ff;color:#372f9e;font-size:15px;font-weight:600;padding:8px 16px;border-radius:999px;margin-bottom:26px;">Due ${dueLabel}</div>`,
    taskLink
      ? `<div><a href="${taskLink}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:10px;">Open in Mindstack</a></div>`
      : '',
    '</div>',
    '<div style="border-top:1px solid #e6e8ec;padding:16px 28px;">',
    '<p style="margin:0;font-size:12.5px;color:#6b7180;">You\'re getting this because you set a reminder for this task in Mindstack.</p>',
    '</div>',
    '</div>',
    '</div>',
  ]
  return rows.join('')
}

function buildReminderEmailText(title: string, dueLabel: string, taskLink: string | null): string {
  const lines = [`${title} is due ${dueLabel}.`]
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

  const { data: dueTasks, error } = await supabase
    .from('pending_task_reminders')
    .select('id,title,due_at,folder_id,user_id')
    .lte('remind_at', new Date().toISOString())
    .limit(100)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const rows = (dueTasks ?? []) as DueTaskRow[]
  if (rows.length === 0) {
    return new Response(JSON.stringify({ checked: 0, sent: 0 }), { status: 200 })
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

  for (const task of rows) {
    const { email, timezone } = await getUserInfo(task.user_id)
    if (!email) {
      failures.push(`${task.id}: no owner email`)
      continue
    }

    const taskLink = APP_URL ? `${APP_URL.replace(/\/$/, '')}/folder/${task.folder_id}` : null
    const dueLabel = formatDue(task.due_at, timezone)

    try {
      await client.send({
        from: GMAIL_USER,
        to: email,
        subject: `Reminder: "${task.title}" is due`,
        content: buildReminderEmailText(task.title, dueLabel, taskLink),
        html: buildReminderEmailHtml(task.title, dueLabel, taskLink),
      })
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', task.id)
        .is('reminder_sent_at', null)
      if (updateError) {
        failures.push(`${task.id}: sent but failed to mark (${updateError.message})`)
      } else {
        sent += 1
      }
    } catch (sendError) {
      failures.push(`${task.id}: ${sendError instanceof Error ? sendError.message : String(sendError)}`)
    }
  }

  await client.close()

  return new Response(JSON.stringify({ checked: rows.length, sent, failures }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
