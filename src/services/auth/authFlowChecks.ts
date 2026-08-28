import {
  isAlreadyRegisteredError,
  isUnconfirmedEmailError,
  toAuthErrorMessage,
} from '../../lib/authErrors'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * Reading a duplicate signup out of a successful response.
 *
 * Supabase does not fail a signup for an address that already exists — telling the caller would turn
 * the form into a way of asking "does this person have an account here", which is why there is no
 * "does this email exist" call anywhere in this app. What it does instead is answer successfully with
 * a user carrying no identities, and send nothing.
 *
 * Mirrors the rule in AuthContext.signUp, stated here as its own function so the three cases can be
 * checked separately — the failure mode of getting it wrong is silent in both directions. Too eager
 * and somebody creating a real account is told to sign in to something that does not exist; too lax
 * and somebody waits forever for a mail that was never sent.
 */
function alreadyRegistered(user: { identities?: unknown } | null): boolean {
  const identities = user?.identities
  return Boolean(user) && Array.isArray(identities) && identities.length === 0
}

function checkDuplicateSignupDetection(): void {
  assert(
    alreadyRegistered({ identities: [] }),
    'a user with no identities means the address was already taken',
  )
  assert(
    !alreadyRegistered({ identities: [{ provider: 'email' }] }),
    'a user with an identity is a real new account',
  )
  // The identity list is absent on some configurations, and that has to read as a genuine signup:
  // erring the other way turns away a real account, which is worse than the problem being solved.
  assert(!alreadyRegistered({}), 'a missing identity list is not evidence of anything')
  assert(!alreadyRegistered(null), 'and no user at all is not a duplicate either')
}

/** The two failures worth telling apart from every other one, because they have actions attached. */
function checkErrorPredicates(): void {
  assert(
    isUnconfirmedEmailError({ message: 'Email not confirmed' }),
    'an unconfirmed account is recognised',
  )
  assert(
    !isUnconfirmedEmailError({ message: 'Invalid login credentials' }),
    'a wrong password is not an unconfirmed account — the two need opposite things from the person',
  )
  assert(
    isAlreadyRegisteredError({ message: 'User already registered' }),
    'an outright duplicate refusal is recognised',
  )
  assert(
    !isAlreadyRegisteredError({ message: 'Invalid login credentials' }),
    'and a sign-in failure is not one',
  )

  // The messages people actually read stay in plain words, and never carry the raw cause.
  assert(
    toAuthErrorMessage({ message: 'Email not confirmed' }).includes('Confirm your email'),
    'the unconfirmed message says what to do',
  )
  assert(
    toAuthErrorMessage({ message: 'permission denied for table folders' }) ===
      'Something went wrong. Please try again.',
    'a database error is never shown to somebody signing in',
  )
}

export function runAuthFlowChecks(): void {
  checkDuplicateSignupDetection()
  checkErrorPredicates()
}
