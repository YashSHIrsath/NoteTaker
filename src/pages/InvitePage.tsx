import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Notice } from '../components/ui/Notice'
import { Spinner } from '../components/ui/Spinner'
import { ProjectLogo } from '../components/brand/ProjectLogo'
import { useAuth } from '../hooks/useAuth'
import { getSpacesRepository, RepositoryError } from '../repositories'
import { clearPendingInvite, stashPendingInvite } from '../lib/pendingInvite'

/**
 * The other end of an invite link.
 *
 * Deliberately outside the auth gate. Someone arriving here may have no account at all — that is
 * the case the whole tokenized-link path exists for — and being bounced to the landing page with
 * the token discarded is exactly how an invitation gets lost. So the token is parked first, before
 * anything else can redirect, and the page then either redeems it or explains what to do.
 */
export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)
  const attempted = useRef(false)

  // First thing, and before any redirect can happen: a token in the URL is a token we might need
  // after a detour through signup.
  useEffect(() => {
    if (token) {
      stashPendingInvite(token)
    }
  }, [token])

  useEffect(() => {
    if (!token || loading || !session || attempted.current) {
      return
    }
    const repository = getSpacesRepository()
    if (!repository) {
      setError('Shared spaces need a server connection.')
      return
    }
    attempted.current = true
    setRedeeming(true)
    void repository
      .respondToInvite({ accept: true, token })
      .then((spaceId) => {
        // The inviter hears back from this route too. It is the same notification the in-app card
        // sends — this page answers by token rather than through SpacesContext, and leaving it out
        // meant an invitation accepted from a link was one the admin never heard about.
        void repository.notifyAnswered({ token })
        clearPendingInvite()
        navigate(`/s/${spaceId}`, { replace: true })
      })
      .catch((caught: unknown) => {
        // Left stashed on failure only when it might still work later — an expired or withdrawn
        // invitation never will, and keeping it would retry forever.
        clearPendingInvite()
        setError(
          caught instanceof RepositoryError
            ? caught.message
            : 'That invitation could not be opened.',
        )
      })
      .finally(() => {
        setRedeeming(false)
      })
  }, [loading, navigate, session, token])

  if (!token) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      {/* Sized, like every other use of it. The mark is an inline SVG with a viewBox and no
        * intrinsic size, so a bare one stretches to fill whatever box it is in — which on a page
        * this empty meant the whole screen. */}
      <ProjectLogo className="h-5 w-[27px] text-[var(--color-accent)]" label="Mindstack" />
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        aria-hidden
      >
        <Mail className="h-6 w-6" />
      </span>

      {session ? (
        <>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
            {redeeming ? 'Joining the space…' : 'Invitation'}
          </h1>
          {error ? (
            <div className="w-full max-w-sm">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}
          {redeeming ? <Spinner /> : null}
          {error ? (
            <Button variant="primary" size="sm" onClick={() => navigate('/spaces')}>
              Go to shared spaces
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
            You've been invited to a shared space
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)]">
            Sign in with the address the invitation was sent to, or create an account with it, and
            you'll be taken straight in. An invitation only opens for the address it was addressed
            to — so if you use a different one, ask whoever invited you to send another.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" size="sm" onClick={() => navigate('/signup')}>
              Create account
            </Button>
            <Button variant="subtle" size="sm" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          </div>
          <Link
            to="/welcome"
            className="text-[12.5px] text-[var(--color-text-muted)] underline-offset-2 hover:underline"
          >
            What is Mindstack?
          </Link>
        </>
      )}
    </div>
  )
}
