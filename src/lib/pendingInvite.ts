/**
 * An invite token, held across signing up.
 *
 * Following an invite link while signed out has to survive whatever happens next, and what happens
 * next is a detour: create an account, confirm an email, possibly come back in a different tab.
 * The auth gate redirects without preserving where you were going, so the token is parked here
 * instead of in the URL — this outlives every one of those steps.
 *
 * Why it is needed at all, when an invitation is addressed to an email and appears on its own once
 * an account with that address exists: because people sign up with a different address than the one
 * that was invited. For them the token is the only thing connecting the two, and losing it at the
 * sign-in screen means the invitation is simply gone.
 */
const PENDING_INVITE_KEY = 'MINDSTACK_PENDING_INVITE'

export function stashPendingInvite(token: string): void {
  try {
    window.localStorage.setItem(PENDING_INVITE_KEY, token)
  } catch {
    /* A private window or a full quota. The email-matched invitation still works. */
  }
}

export function readPendingInvite(): string | null {
  try {
    const value = window.localStorage.getItem(PENDING_INVITE_KEY)
    return value && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

export function clearPendingInvite(): void {
  try {
    window.localStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    /* Nothing to do; a stale token is refused by the server anyway. */
  }
}
