import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { toAuthErrorMessage } from '../lib/authErrors'
import { useAuth } from '../hooks/useAuth'

const inputClassName =
  'mt-1.5 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20'

export function LoginPage() {
  const { signIn, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (cause) {
      setError(toAuthErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthScreen title="Login" footer={<Link to="/signup" className="text-[var(--color-accent)] hover:underline">Create an account</Link>}>
      {!configured ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local environment.
        </p>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block text-sm text-[var(--color-text-muted)]">
            Email
            <input
              className={inputClassName}
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-[var(--color-text-muted)]">
            Password
            <input
              className={inputClassName}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={submitting || !email.trim() || !password}>
            {submitting ? 'Signing in…' : 'Login'}
          </Button>
        </form>
      )}
    </AuthScreen>
  )
}

export function SignupPage() {
  const { signUp, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Choose a stronger password (at least 6 characters).')
      return
    }
    setSubmitting(true)
    try {
      const result = await signUp(email.trim(), password)
      if (result.needsEmailConfirmation) {
        setNotice('Check your email to confirm your account, then return here to log in.')
      }
    } catch (cause) {
      setError(toAuthErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthScreen title="Sign Up" footer={<Link to="/login" className="text-[var(--color-accent)] hover:underline">Already have an account? Login</Link>}>
      {!configured ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local environment.
        </p>
      ) : notice ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[var(--color-text)]">{notice}</p>
          <Link to="/login" className="inline-block text-sm text-[var(--color-accent)] hover:underline">
            Go to Login
          </Link>
        </div>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block text-sm text-[var(--color-text-muted)]">
            Email
            <input
              className={inputClassName}
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-[var(--color-text-muted)]">
            Password
            <input
              className={inputClassName}
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-[var(--color-text-muted)]">
            Confirm Password
            <input
              className={inputClassName}
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={6}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={submitting || !email.trim() || password.length < 6 || !confirmPassword}
          >
            {submitting ? 'Creating account…' : 'Create Account'}
          </Button>
        </form>
      )}
    </AuthScreen>
  )
}

function AuthScreen({
  title,
  footer,
  children,
}: {
  title: string
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--color-surface-muted)] p-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">MyNotes</p>
        <h1 className="mt-1 text-lg font-semibold text-[var(--color-text)]">{title}</h1>
        {children}
        <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">{footer}</p>
      </div>
    </div>
  )
}
