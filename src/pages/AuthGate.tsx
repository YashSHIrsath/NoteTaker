import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { IS_NATIVE } from '../lib/platform'

function AuthSplash({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--color-surface)] text-sm text-[var(--color-text-muted)]">
      {label}
    </div>
  )
}

export function RequireAuth() {
  const { loading, session } = useAuth()

  if (loading) {
    return <AuthSplash label="Loading…" />
  }

  if (!session) {
    // On the web: the landing page, which explains what this is and carries both buttons.
    // In the app: straight to sign in. Someone who installed the APK has already been sold on it,
    // and the landing page's job — pitch, screenshots, links to the policies — is a website's job.
    return <Navigate to={IS_NATIVE ? '/login' : '/welcome'} replace />
  }

  return <Outlet />
}

export function GuestOnly() {
  const { loading, session } = useAuth()

  if (loading) {
    return <AuthSplash label="Loading…" />
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
