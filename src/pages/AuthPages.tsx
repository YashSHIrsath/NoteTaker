import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, AtSign, Check, Eye, EyeOff, KeyRound, MailCheck, User } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import {
  isAlreadyRegisteredError,
  isUnconfirmedEmailError,
  toAuthErrorMessage,
} from '../lib/authErrors'
import { useAuth } from '../hooks/useAuth'
import { ProjectLogo } from '../components/brand/ProjectLogo'
import { cn } from '../lib/cn'
import { IS_NATIVE } from '../lib/platform'

const MIN_PASSWORD_LENGTH = 6

/** One field shape for every input here: icon in the gutter, label above, ring on focus. */
function Field({
  label,
  icon,
  hint,
  trailing,
  ...input
}: {
  label: string
  icon: ReactNode
  hint?: string
  trailing?: ReactNode
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-[var(--color-text-muted)]">{label}</span>
      <span className="relative mt-1 block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
          {icon}
        </span>
        <input
          {...input}
          className={cn(
            'w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] py-2.5 pl-10 text-sm text-[var(--color-text)]',
            'outline-none transition-colors placeholder:text-[var(--color-text-muted)]/70',
            'focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20',
            trailing ? 'pr-11' : 'pr-3',
          )}
        />
        {trailing ? <span className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</span> : null}
      </span>
      {hint ? <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">{hint}</span> : null}
    </label>
  )
}

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      title={shown ? 'Hide password' : 'Show password'}
      className="anim-press inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
    >
      {shown ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
    </button>
  )
}

/**
 * "Send it again", for a confirmation mail that never arrived.
 *
 * The one honest answer to the case this whole flow kept getting wrong: an account exists, it was
 * never confirmed, and the person is stuck with no way forward. Delivery fails for reasons nobody in
 * the app can see — a spam filter, a typo'd domain, a provider having a bad afternoon — so the fix
 * has to be reachable from the screen where they notice.
 */
function ResendConfirmation({ email }: { email: string }) {
  const { resendConfirmation } = useAuth()
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [failed, setFailed] = useState<string | null>(null)

  if (state === 'sent') {
    return (
      <p className="text-[12.5px] text-[var(--color-text-muted)]">
        Sent again to {email.trim()}. It can take a minute — check spam too.
      </p>
    )
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={state === 'sending' || !email.trim()}
        onClick={() => {
          setState('sending')
          setFailed(null)
          void resendConfirmation(email)
            .then(() => setState('sent'))
            .catch((cause: unknown) => {
              setFailed(toAuthErrorMessage(cause))
              setState('idle')
            })
        }}
        className="text-[12.5px] font-semibold text-[var(--color-accent)] underline-offset-2 hover:underline disabled:opacity-60"
      >
        {state === 'sending' ? 'Sending…' : 'Send the confirmation email again'}
      </button>
      {failed ? <p className="text-[12px] text-[var(--color-danger)]">{failed}</p> : null}
    </div>
  )
}

export function LoginPage() {
  const { signIn, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tracked separately from the message, because this is the one failure with something to *do*
  // about it rather than something to read.
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setUnconfirmed(false)
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (cause) {
      setError(toAuthErrorMessage(cause))
      setUnconfirmed(isUnconfirmedEmailError(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to reach your notes, tasks and folders."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-semibold text-[var(--color-accent)] hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      {!configured ? (
        <NotConfigured />
      ) : (
        <form className="space-y-3.5" onSubmit={(event) => void handleSubmit(event)}>
          <Field
            label="Email"
            icon={<AtSign className="h-4 w-4" aria-hidden />}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Field
            label="Password"
            icon={<KeyRound className="h-4 w-4" aria-hidden />}
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((value) => !value)} />}
          />
          <FormError message={error} />
          {/* Offered only for the one failure that has an action: the account is real and the
            * password may well be right — what is missing is the confirmation mail. */}
          {unconfirmed ? <ResendConfirmation email={email} /> : null}
          <SubmitButton busy={submitting} disabled={!email.trim() || !password}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </SubmitButton>
        </form>
      )}
    </AuthScreen>
  )
}

export function SignupPage() {
  const { signUp, configured } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /**
   * That address already has an account.
   *
   * Its own state rather than an error string, because it is not a mistake to correct — it is a fork:
   * sign in, or have the confirmation mail sent again if it never arrived. Which is the whole reason
   * this case needed telling apart from a successful signup at all.
   */
  const [taken, setTaken] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setTaken(false)
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`)
      return
    }
    setSubmitting(true)
    try {
      const result = await signUp(email.trim(), password, fullName)
      if (result.alreadyRegistered) {
        // Nothing was created and no mail was sent — see SignUpOutcome. Saying "check your email"
        // here, which is what happened before, left somebody waiting for a mail that was never
        // coming.
        setTaken(true)
        return
      }
      if (result.needsEmailConfirmation) {
        setNotice('Check your email to confirm your account, then come back and sign in.')
      }
    } catch (cause) {
      // Some configurations refuse a duplicate outright instead of answering successfully; both
      // routes end in the same place for the person reading the screen.
      if (isAlreadyRegisteredError(cause)) {
        setTaken(true)
        return
      }
      setError(toAuthErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthScreen
      title={notice ? 'Almost there' : taken ? 'That email is already in use' : 'Create your workspace'}
      subtitle={
        notice || taken ? undefined : 'A few details and your notes are ready to sync.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-[var(--color-accent)] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {!configured ? (
        <NotConfigured />
      ) : taken ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] p-3">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
            <p className="text-[13px] leading-relaxed text-[var(--color-text)]">
              <span className="font-semibold">{email.trim()}</span> already has an account, so nothing
              new was created and no email was sent.
            </p>
          </div>
          <Link
            to="/login"
            className="anim-press inline-flex w-full items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent)]/90"
          >
            Sign in instead
          </Link>
          {/* The case that is otherwise a dead end: the account was made, the confirmation mail never
            * arrived, and signing up again cannot help because the address is taken. */}
          <div className="border-t border-[var(--color-border)] pt-3">
            <p className="mb-1.5 text-[12.5px] text-[var(--color-text-muted)]">
              Never got the confirmation email?
            </p>
            <ResendConfirmation email={email} />
          </div>
          <button
            type="button"
            onClick={() => setTaken(false)}
            className="text-[12.5px] text-[var(--color-text-muted)] underline-offset-2 hover:underline"
          >
            Use a different email
          </button>
        </div>
      ) : notice ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-[var(--color-accent)]/25 bg-[var(--color-accent-soft)] p-3">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden />
            <p className="text-[13px] leading-relaxed text-[var(--color-accent-ink)]">{notice}</p>
          </div>
          <Link
            to="/login"
            className="anim-press inline-flex w-full items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent)]/90"
          >
            Go to sign in
          </Link>
        </div>
      ) : (
        <form className="space-y-3.5" onSubmit={(event) => void handleSubmit(event)}>
          <Field
            label="Your name"
            icon={<User className="h-4 w-4" aria-hidden />}
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Your Name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
          <Field
            label="Email"
            icon={<AtSign className="h-4 w-4" aria-hidden />}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Field
            label="Password"
            icon={<KeyRound className="h-4 w-4" aria-hidden />}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((value) => !value)} />}
          />
          <Field
            label="Confirm password"
            icon={<Check className="h-4 w-4" aria-hidden />}
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
          <FormError message={error} />
          <SubmitButton
            busy={submitting}
            disabled={!fullName.trim() || !email.trim() || password.length < MIN_PASSWORD_LENGTH || !confirmPassword}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </SubmitButton>
        </form>
      )}
    </AuthScreen>
  )
}

function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy: boolean
  disabled: boolean
  children: ReactNode
}) {
  return (
    <Button
      type="submit"
      variant="primary"
      className="mt-1 w-full justify-center rounded-xl py-2.5 text-sm font-semibold"
      disabled={busy || disabled}
    >
      {busy ? <Spinner /> : null}
      {children}
    </Button>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null
  }
  return (
    <p
      role="alert"
      className="anim-item-in rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-3 py-2 text-[13px] text-[var(--color-danger)]"
    >
      {message}
    </p>
  )
}

function NotConfigured() {
  return (
    <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
      Supabase isn&rsquo;t configured. Add <code>VITE_SUPABASE_URL</code> and{' '}
      <code>VITE_SUPABASE_ANON_KEY</code> to this environment, then reload.
    </p>
  )
}

/**
 * The way out of an auth screen — on the web only.
 *
 * There is nothing behind these pages in the Android app: `AuthGate` sends a signed-out session
 * straight to /login there, because the app ships without the marketing site. A back control would
 * be a door onto a wall. On the web the same session starts at /welcome, so there is always
 * somewhere to go back to.
 *
 * `location.key` is 'default' only for the first entry in a history session — i.e. this page was
 * opened cold, from a bookmark or a link, and history has nothing of ours to step back into. Then
 * the landing page is the honest destination rather than whatever site sent them here.
 */
function BackToSite() {
  const navigate = useNavigate()
  const location = useLocation()

  if (IS_NATIVE) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => (location.key === 'default' ? navigate('/welcome') : navigate(-1))}
      className={cn(
        'anim-press mb-4 inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12.5px] font-medium',
        'text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Back
    </button>
  )
}

function AuthScreen({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string
  subtitle?: string
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-[var(--color-surface-muted)] p-4">
      {/* Two soft washes of the brand colours behind the card — enough to make the page feel like
          part of the app rather than a bare form on a flat background. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full opacity-70 blur-2xl"
        style={{ background: 'radial-gradient(circle at 40% 40%, var(--color-accent-soft), transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full opacity-60 blur-2xl"
        style={{ background: 'radial-gradient(circle at 50% 50%, var(--cat-rose-soft), transparent 70%)' }}
      />

      <div className="anim-panel-in relative w-full max-w-[620px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] sm:p-8">
        <BackToSite />
        <div className="mb-5 flex items-center gap-2.5">
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            aria-hidden
          >
            <ProjectLogo className="h-4 w-[22px]" />
          </span>
          <span
            className="text-[17px] font-semibold tracking-tight text-[var(--color-text)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Mindstack
          </span>
        </div>

        <h1
          className="text-[22px] font-semibold tracking-tight text-[var(--color-text)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text-muted)]">{subtitle}</p>
        ) : null}

        <div className="mt-5">{children}</div>

        <p className="mt-5 border-t border-[var(--color-border)] pt-4 text-center text-[13px] text-[var(--color-text-muted)]">
          {footer}
        </p>
      </div>
    </div>
  )
}
