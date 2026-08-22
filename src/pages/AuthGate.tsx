import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

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
    // The landing page, not the login form: it explains what this is and has both buttons on it.
    return <Navigate to="/welcome" replace />
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
