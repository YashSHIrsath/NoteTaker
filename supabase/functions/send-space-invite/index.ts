// Invitation mail for shared spaces. Two messages, one function, because they share a transport, a
// template and an authorisation model.
//
//   invited   — to the person being invited. Sent when an owner or admin invites an address.
//   answered  — to the inviter. Sent when that person accepts or declines.
//
// Called by the app rather than by cron, so unlike send-task-reminders this one verifies a JWT: the
// caller's token identifies who is asking, and the function refuses to send a message that person
// is not entitled to cause. Deploy WITH jwt verification (the default) — there is no shared secret
// here because there is no unauthenticated caller.
//
//     supabase functions deploy send-space-invite
//
// The sender is the same two secrets the reminder mail uses, GMAIL_USER and GMAIL_APP_PASSWORD, and
// no address is written down here. Gmail's SMTP will not send as an address it did not authenticate
// as, so those two always move together.
//
// What this function will not do:
//
//   It will not tell the caller whether the invited address has an account. That is the one fact
//   the signup form deliberately refuses to reveal, and an invite endpoint that leaked it would be
//   an enumeration oracle. The answer decides which sentence goes into a message addressed to that
//   address, and never appears in a response.
//
//   It will not add anybody to anything. Membership happens in respond_to_space_invite, when the
//   person themselves accepts. This function only writes email.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
const MAIL_FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'Mindstack'
const APP_URL = Deno.env.get('APP_URL') ?? ''

const LOGO_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/brand/email-logo.png`
  : null

const DISPLAY_FONT = "'Sansita','Iowan Old Style',Georgia,serif"
const BODY_FONT = "'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif"

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface MailContext {
  invite_id: string
  invite_email: string
  invite_role: string
  invite_token: string
  invite_status: string
  expires_at: string
  space_id: string
  space_name: string
  inviter_id: string | null
  inviter_name: string | null
  inviter_email: string | null
  invitee_has_account: boolean
  invitee_name: string | null
  caller_role: string | null
  caller_email: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const ROLE_WORDS: Record<string, string> = {
  admin: 'an admin — you will be able to edit everything and manage who else is in it',
  editor: 'an editor — you will be able to add, edit and delete notes and tasks',
  viewer: 'a viewer — you will be able to read everything, and change nothing',
}

/**
 * The message, in the same shape as the reminder mail.
 *
 * Deliberately a copy rather than a shared module. Edge Functions deploy independently, and a
 * template shared across two of them means a change to a reminder can break an invitation in a
 * deploy that never mentioned invitations. It is fifty lines of inline styles; the coupling costs
 * more than the duplication.
 */
function buildEmailHtml(args: {
  eyebrow: string
  title: string
  body: string
  metaLabel: string | null
  metaValue: string | null
  ctaLabel: string | null
  ctaLink: string | null
  footer: string
  /** Something that differs between any two messages — see the preheader. */
  traceId: string
}): string {
  const { eyebrow, title, body, metaLabel, metaValue, ctaLabel, ctaLink, footer, traceId } = args

  return [
    "<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sansita:wght@700;800&display=swap');</style>",

    /* The preheader: the inbox's preview line, and the thing that stops Gmail folding a second
     * message with an identical header and footer behind a "..." button. The trace id is the part
     * that differs between any two. */
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">',
    escapeHtml(body),
    `<span>&#8204;&#847;&nbsp;${escapeHtml(traceId)}</span>`,
    '&#8204;&nbsp;'.repeat(60),
    '</div>',

    '<div style="background-color:#f0f0f4;padding:32px 16px;">',
    `<div style="max-width:520px;margin:0 auto;background-color:#ffffff;border:1px solid #e4e4ec;border-radius:14px;overflow:hidden;font-family:${BODY_FONT};">`,

    '<div style="padding:18px 28px;border-bottom:1px solid #ececf2;">',
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>',
    LOGO_URL
      ? `<td style="vertical-align:middle;padding-right:9px;"><img src="${LOGO_URL}" width="29" height="20" alt="" style="display:block;border:0;outline:none;text-decoration:none;"></td>`
      : '',
    `<td style="vertical-align:middle;"><span style="font-family:${DISPLAY_FONT};font-size:20px;font-weight:800;letter-spacing:-0.01em;color:#14161a;">Mindstack</span></td>`,
    '</tr></table>',
    '</div>',

    '<div style="padding:26px 28px 28px 28px;">',
    `<p style="margin:0 0 10px 0;font-family:${BODY_FONT};font-size:11.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#4f46e5;">`,
    '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:#4f46e5;vertical-align:middle;margin-right:7px;"></span>',
    escapeHtml(eyebrow),
    '</p>',

    `<h1 style="margin:0 0 12px 0;font-family:${DISPLAY_FONT};font-size:28px;line-height:1.25;font-weight:800;letter-spacing:-0.01em;color:#14161a;">${escapeHtml(title)}</h1>`,
    `<p style="margin:0 0 20px 0;font-family:${BODY_FONT};font-size:15.5px;line-height:1.55;color:#434852;">${escapeHtml(body)}</p>`,

    metaLabel && metaValue
      ? `<p style="margin:0 0 24px 0;font-family:${BODY_FONT};font-size:13px;line-height:1.5;letter-spacing:0.02em;color:#8a8fa0;">${escapeHtml(metaLabel)} &middot; ${escapeHtml(metaValue)}</p>`
      : '',

    ctaLabel && ctaLink
      ? `<div><a href="${ctaLink}" style="display:inline-block;font-family:${BODY_FONT};background-color:#4f46e5;color:#ffffff;font-size:14.5px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:999px;">${escapeHtml(ctaLabel)} &rarr;</a></div>`
      : '',
    '</div>',

    '<div style="border-top:1px solid #ececf2;padding:14px 28px;">',
    `<span style="font-family:${BODY_FONT};font-size:12px;color:#8a8fa0;">${escapeHtml(footer)}</span>`,
    '</div>',

    '</div>',
    '</div>',
  ]
    .filter(Boolean)
    .join('')
}

function buildEmailText(args: {
  body: string
  metaLabel: string | null
  metaValue: string | null
  ctaLink: string | null
}): string {
  const lines = [args.body]
  if (args.metaLabel && args.metaValue) {
    lines.push('', `${args.metaLabel}: ${args.metaValue}`)
  }
  if (args.ctaLink) {
    lines.push('', args.ctaLink)
  }
  return lines.join('\n')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Not configured' }, 500)
  }
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    // A missing mailbox is a deployment problem, not a caller's problem — and the invitation itself
    // has already been created, so this is reported rather than dressed up as success.
    return json({ error: 'No mailbox configured' }, 503)
  }

  const authorization = request.headers.get('Authorization') ?? ''
  const jwt = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return json({ error: 'Not authenticated' }, 401)
  }

  let payload: { action?: string; inviteId?: string; token?: string }
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Expected a JSON body' }, 400)
  }

  const action = payload.action
  if (action !== 'invited' && action !== 'answered') {
    return json({ error: 'Unknown action' }, 400)
  }
  if (!payload.inviteId && !payload.token) {
    return json({ error: 'Which invitation?' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Who is asking. The JWT is verified by Supabase before this runs, but the *identity* in it still
  // has to be read here — every authorisation decision below is about this person.
  const { data: caller, error: callerError } = await admin.auth.getUser(jwt)
  const callerId = caller?.user?.id
  if (callerError || !callerId) {
    return json({ error: 'Not authenticated' }, 401)
  }

  const { data, error } = await admin.rpc('space_invite_mail_context', {
    p_invite_id: payload.inviteId ?? null,
    p_token: payload.token ?? null,
    p_caller: callerId,
  })
  if (error) {
    console.error('mail context failed', error)
    return json({ error: 'Could not read that invitation' }, 500)
  }
  const context = (Array.isArray(data) ? data[0] : data) as MailContext | null | undefined
  if (!context) {
    return json({ error: 'That invitation no longer exists' }, 404)
  }

  const appUrl = APP_URL.replace(/\/$/, '')
  const mailFrom = `"${MAIL_FROM_NAME.replace(/["\\]/g, '')}" <${GMAIL_USER}>`
  const smtp = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  })

  try {
    if (action === 'invited') {
      // Only an owner or admin — the same rule invite_to_space enforces on creating the invitation.
      // Checked again here because this is a separate endpoint: an invitation created legitimately
      // must not become something any member can re-send to that address at will.
      if (context.caller_role !== 'owner' && context.caller_role !== 'admin') {
        return json({ error: 'Only an owner or admin can invite people' }, 403)
      }
      if (context.invite_status !== 'pending') {
        return json({ error: 'That invitation has already been answered' }, 409)
      }

      const inviter = context.inviter_name || context.inviter_email || 'Someone'
      const link = appUrl ? `${appUrl}/invite/${context.invite_token}` : null
      const roleWord = ROLE_WORDS[context.invite_role] ?? 'a member'

      /*
       * The two sentences.
       *
       * An account already exists: the only thing left to do is sign in and say yes. There is no
       * account: the invitation cannot be accepted by anybody but this address, so the account has
       * to come first — and it has to be made with *this* address, which is the part people get
       * wrong and then cannot work out why the link does nothing.
       */
      const body = context.invitee_has_account
        ? `${inviter} has invited you to ${context.space_name} on Mindstack, as ${roleWord}. ` +
          `Sign in with this address and the invitation will be waiting for you — you can accept it or turn it down.`
        : `${inviter} has invited you to ${context.space_name} on Mindstack, as ${roleWord}. ` +
          `You'll need an account first: create one with this address, and the invitation will be waiting for you to accept or turn down. ` +
          `An invitation only opens for the address it was sent to, so signing up with a different one will not find it.`

      const expires = new Date(context.expires_at)
      const metaValue = Number.isNaN(expires.getTime())
        ? null
        : expires.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

      await smtp.send({
        from: mailFrom,
        to: context.invite_email,
        subject: `${inviter} invited you to ${context.space_name}`,
        content: buildEmailText({
          body,
          metaLabel: 'Expires',
          metaValue,
          ctaLink: link,
        }),
        html: buildEmailHtml({
          eyebrow: 'Invitation',
          title: context.space_name,
          body,
          metaLabel: 'Expires',
          metaValue,
          ctaLabel: context.invitee_has_account ? 'Sign in and accept' : 'Create an account',
          ctaLink: link,
          footer: 'You were invited by email. Nothing is shared with you until you accept.',
          traceId: `${context.invite_id}:invited`,
        }),
      })

      return json({ sent: true })
    }

    // ------------------------------------------------------------------ answered
    //
    // Only the person the invitation names may cause this, and only once it has actually been
    // answered. Both matter: without the first, anyone holding a token could tell an admin their
    // invitation was declined; without the second, a "declined" mail could be sent while the
    // invitation was still open.
    const callerEmail = (context.caller_email ?? '').toLowerCase()
    if (!callerEmail || callerEmail !== context.invite_email.trim().toLowerCase()) {
      return json({ error: 'That invitation is not yours to answer' }, 403)
    }
    if (context.invite_status !== 'accepted' && context.invite_status !== 'declined') {
      return json({ error: 'That invitation has not been answered' }, 409)
    }
    if (!context.inviter_email) {
      // Nobody to tell. Not an error: the inviter's account can have been deleted since.
      return json({ sent: false, reason: 'no inviter' })
    }

    const accepted = context.invite_status === 'accepted'
    const who = context.invitee_name || context.invite_email
    const body = accepted
      ? `${who} accepted your invitation and is now in ${context.space_name}. Everything in the space is theirs to work on from now on, and every change they make is recorded against their name.`
      : `${who} turned down your invitation to ${context.space_name}. Nothing has been shared with them. You can invite them again whenever you like.`

    await smtp.send({
      from: mailFrom,
      to: context.inviter_email,
      subject: accepted
        ? `${who} joined ${context.space_name}`
        : `${who} declined ${context.space_name}`,
      content: buildEmailText({
        body,
        metaLabel: 'Space',
        metaValue: context.space_name,
        ctaLink: appUrl ? `${appUrl}/s/${context.space_id}` : null,
      }),
      html: buildEmailHtml({
        eyebrow: accepted ? 'Joined' : 'Declined',
        title: context.space_name,
        body,
        metaLabel: 'Invited',
        metaValue: context.invite_email,
        ctaLabel: accepted ? 'Open the space' : null,
        ctaLink: accepted && appUrl ? `${appUrl}/s/${context.space_id}` : null,
        footer: "You're getting this because you invited them to a space you manage.",
        traceId: `${context.invite_id}:${context.invite_status}`,
      }),
    })

    return json({ sent: true })
  } catch (caught) {
    console.error('invite mail failed', caught)
    return json({ error: 'Could not send that email' }, 502)
  } finally {
    // Closed explicitly: the isolate winds down as soon as the response is returned, and a socket
    // with a read still pending is what logs "operation canceled" out of send-task-reminders.
    try {
      await smtp.close()
    } catch {
      /* Already closed, or never opened. */
    }
  }
})
