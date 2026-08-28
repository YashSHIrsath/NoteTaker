import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Mail, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Notice } from '../ui/Notice'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { cn } from '../../lib/cn'
import { INVITABLE_ROLES, type SpaceRole } from '../../types'
import { ROLE_LABELS, ROLE_SUMMARY } from '../../lib/spaceRoles'

export interface InviteMemberDialogProps {
  open: boolean
  spaceName: string
  onClose: () => void
  /** Resolves to the invitation's token, which is what the shareable link is built from. */
  onInvite: (email: string, role: SpaceRole) => Promise<string>
}

/** Where an invite link points. Absolute, because the whole point is to paste it somewhere else. */
function inviteLink(token: string): string {
  return `${window.location.origin}/invite/${token}`
}

/**
 * Asking someone to join, by email.
 *
 * Addressed to an email rather than picked from a list of users, because requiring the invitee to
 * already have an account means every invitation starts with "sign up first, then tell me". The
 * invitation waits for them: it appears in their app the moment an account with that address
 * exists, and the link below works even if they sign up with a different one.
 */
export function InviteMemberDialog({
  open,
  spaceName,
  onClose,
  onInvite,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<SpaceRole>('editor')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const emailId = useId()

  useEffect(() => {
    if (open) {
      setEmail('')
      setRole('editor')
      setSubmitting(false)
      setError(null)
      setToken(null)
      setCopied(false)
    }
  }, [open])

  useDialogFocus(open, inputRef)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, submitting])

  if (!open) {
    return null
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || submitting) {
      return
    }
    setSubmitting(true)
    setError(null)
    void onInvite(trimmed, role)
      .then((created) => {
        // The dialog stays open and shows the link rather than closing on success: for someone
        // without an account yet, this link is the only way in, and closing the dialog would be
        // the moment it was lost.
        setToken(created)
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not send the invitation.')
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  const handleCopy = () => {
    if (!token) {
      return
    }
    void navigator.clipboard
      .writeText(inviteLink(token))
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => {
        setError('Could not copy the link. Select it and copy it by hand.')
      })
  }

  return createPortal(
    <div
      /*
       * Portalled to the body, and scrollable from the top rather than centred.
       *
       * Two separate things went wrong here. `fixed inset-0` is only relative to the viewport while
       * no ancestor has a transform — and a page arriving under anim-page-enter has one — so the
       * overlay was being contained by the page content instead of covering the screen. And
       * `items-center` on a dialog taller than the space available overflows it equally above and
       * below, which is what cut the heading off the top rather than scrolling the body.
       *
       * items-start with the container scrolling means the top can never be clipped; sm:items-center
       * still centres it whenever there is room. Same reasoning as the menus, which portal for
       * exactly this reason.
       */
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={submitting ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-dialog-in relative my-auto flex max-h-[min(90vh,36rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        {/* shrink-0, and the body below owns the scrolling.
          *
          * Without it flexbox treats this row as shrinkable and, on a short viewport, squeezes the
          * title and close button to nothing while the form runs off the top of the screen — which
          * is precisely how this dialog appeared with no heading and a clipped first field. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--color-accent-soft)' }}
              aria-hidden
            >
              <Mail className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
            </span>
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-[var(--color-text)]">
              Invite to {spaceName}
            </h2>
          </div>
          <IconButton label="Close" onClick={submitting ? undefined : onClose} disabled={submitting}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {token ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--color-text)]">
                Invited <span className="font-semibold">{email.trim()}</span> as{' '}
                {ROLE_LABELS[role].toLowerCase()}.
              </p>
              <p className="text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
                If they already use Mindstack it's waiting on their Shared spaces page. If not, send
                them this link — it survives signing up.
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={inviteLink(token)}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[12px] text-[var(--color-text-muted)] outline-none"
                />
                <Button variant="subtle" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" aria-hidden /> Copied
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
                    </span>
                  )}
                </Button>
              </div>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <div className="mt-1 flex justify-end gap-2">
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setToken(null)
                    setEmail('')
                    setCopied(false)
                  }}
                >
                  Invite someone else
                </Button>
                <Button variant="primary" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label
                htmlFor={emailId}
                className="block text-sm font-medium text-[var(--color-text-muted)]"
              >
                Email address
              </label>
              <input
                ref={inputRef}
                id={emailId}
                name="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="them@example.com"
                className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                autoComplete="off"
              />

              <p className="mt-4 text-sm font-medium text-[var(--color-text-muted)]">Role</p>
              <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label="Role">
                {INVITABLE_ROLES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={role === option}
                    onClick={() => setRole(option)}
                    className={cn(
                      'anim-press flex items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors',
                      role === option
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                        : 'border-[var(--color-border)] hover:bg-[var(--color-hover)]',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                        role === option
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                          : 'border-[var(--color-border-strong)]',
                      )}
                      aria-hidden
                    >
                      {role === option ? <Check className="h-3 w-3 text-white" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-[var(--color-text)]">
                        {ROLE_LABELS[option]}
                      </span>
                      <span className="block text-[12px] leading-snug text-[var(--color-text-muted)]">
                        {ROLE_SUMMARY[option]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {error ? (
                <div className="mt-4">
                  <Notice tone="danger">{error}</Notice>
                </div>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <Button variant="subtle" size="sm" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!email.trim() || submitting}
                >
                  {submitting ? 'Inviting…' : 'Send invitation'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
