function rawMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : typeof error === 'string'
      ? error
      : ''
}

/**
 * Whether the account exists but has never been confirmed.
 *
 * Worth telling apart from a wrong password, because the two need opposite things from the person:
 * one is "try again", the other is "the mail we sent never arrived, here it is again". Answering
 * both with "incorrect email or password" is what leaves somebody retyping a password that was
 * right all along.
 */
export function isUnconfirmedEmailError(error: unknown): boolean {
  const normalized = rawMessage(error).toLowerCase()
  return normalized.includes('email not confirmed') || normalized.includes('not_confirmed')
}

/** An address that already has an account, on configurations where Supabase says so outright. */
export function isAlreadyRegisteredError(error: unknown): boolean {
  const normalized = rawMessage(error).toLowerCase()
  return normalized.includes('already registered') || normalized.includes('already been registered')
}

export function toAuthErrorMessage(error: unknown): string {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : typeof error === 'string'
        ? error
        : ''

  const normalized = raw.toLowerCase()

  if (normalized.includes('not configured')) {
    return 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  }
  if (normalized.includes('invalid login credentials')) {
    return 'Incorrect email or password.'
  }
  if (normalized.includes('passwords do not match')) {
    return 'Passwords do not match.'
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email before signing in. Check your inbox for the confirmation link.'
  }
  if (normalized.includes('user already registered')) {
    return 'An account with this email already exists.'
  }
  if (normalized.includes('password should be at least') || normalized.includes('password is known to be weak')) {
    return 'Choose a stronger password (at least 6 characters).'
  }
  if (normalized.includes('unable to validate email')) {
    return 'Enter a valid email address.'
  }
  if (normalized.includes('over_email_send_rate_limit') || normalized.includes('rate limit')) {
    return 'Too many attempts. Try again in a moment.'
  }

  return 'Something went wrong. Please try again.'
}
