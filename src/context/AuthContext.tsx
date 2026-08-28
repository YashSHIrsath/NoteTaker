import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getAuthEmailRedirectTo } from '../lib/authRedirect'
import { getSupabaseClient } from '../lib/supabase'
import { tilesPerRowUpdate, type TileBandId, type TilesPerRow, type ViewStyle } from '../lib/viewStyle'
import { fontUpdate, type FontRole } from '../lib/fonts'
import { defaultPageUpdate, navOrderUpdate, type NavId } from '../lib/navOrder'
import type { SidebarNavId } from '../types'

export interface ProfileUpdate {
  fullName?: string
  avatarUrl?: string
  /** IANA zone (e.g. "Asia/Kolkata") — kept fresh so reminder emails can show local time. */
  timezone?: string
  /** Whether the Notes/Important pages render as classic list cards or as colorful tiles. */
  viewStyle?: ViewStyle
  /**
   * Tiles per row in the note grids, or 'auto' to let the available width decide — recorded
   * against one screen size, not the account as a whole. `tilesPerRowBand` says which.
   */
  tilesPerRow?: TilesPerRow
  /** The bottom bar's tab order. Also decides which side a page slides in from. */
  navOrder?: NavId[]
  /** Which page a cold start opens on. */
  /** A font id from lib/fonts, for one of the two roles. */
  font?: { role: FontRole; id: string }
  defaultPage?: SidebarNavId
  /** Which workspace that choice is for. Absent or null means the personal one. */
  defaultPageSpaceId?: string | null
  /** Which screen size the tilesPerRow above applies to. Required alongside it. */
  tilesPerRowBand?: TileBandId
}

/**
 * What happened when somebody tried to create an account.
 *
 * `alreadyRegistered` matters because the honest answer is not an error. Supabase deliberately does
 * not fail a signup for an address that already exists — telling the caller would turn the form into
 * a way of asking "does this person have an account here", which is somebody's business and nobody
 * else's. What it does instead is answer successfully with a user carrying no identities, and send
 * nothing. That is the signal, and reading it gives an honest message without adding a way to probe
 * for addresses.
 */
export interface SignUpOutcome {
  needsEmailConfirmation: boolean
  /** True when that address already has an account. Nothing was created and no mail was sent. */
  alreadyRegistered: boolean
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName?: string) => Promise<SignUpOutcome>
  /**
   * Sends the confirmation email again.
   *
   * The answer to "I signed up and nothing arrived" — a mail can be delayed, filtered or bounced,
   * and until this existed the only route left was to start over with a different address.
   */
  resendConfirmation: (email: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (update: ProfileUpdate) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getSupabaseClient()
  const [session, setSession] = useState<Session | null>(null)
  /*
   * The session, readable from a callback that outlives the render it was built in.
   *
   * updateProfile depends on `client` alone, which never changes, so it is created once — before
   * there is a session at all. Anything it needs from the session has to come from here or it reads
   * the first render's answer for the life of the app. Written during render deliberately: a callback
   * fired between a render and an effect must not see the previous value.
   */
  const sessionRef = useRef<Session | null>(session)
  sessionRef.current = session
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!client) {
      setSession(null)
      setLoading(false)
      return
    }

    let cancelled = false

    void client.auth.getSession().then(({ data, error }) => {
      if (cancelled) {
        return
      }
      if (error) {
        setSession(null)
      } else {
        setSession(data.session)
      }
      setLoading(false)
    })

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [client])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!client) {
      throw new Error('Supabase is not configured.')
    }
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) {
      throw error
    }
  }, [client])

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    if (!client) {
      throw new Error('Supabase is not configured.')
    }
    const name = fullName?.trim()
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthEmailRedirectTo(),
        // Stored on the account at creation, so the sidebar, profile and bottom-bar avatar have a
        // name to show from the very first session instead of falling back to the email.
        data: name ? { full_name: name } : undefined,
      },
    })
    if (error) {
      throw error
    }
    /*
     * An existing address comes back as a success with an empty identity list.
     *
     * Supabase returns that rather than an error so a signup form cannot be used to discover who has
     * an account — which is right, and is why there is no "does this email exist" call anywhere in
     * this app. The consequence is that a duplicate signup used to look exactly like a real one:
     * "check your email", for a mail that was never sent. This reads the signal it does give.
     *
     * The `identities` array is absent on some configurations, so an undefined one is treated as a
     * genuine signup — reporting a real new account as a duplicate would be the worse mistake.
     */
    const identities = data.user?.identities
    return {
      needsEmailConfirmation: data.session === null,
      alreadyRegistered: Boolean(data.user) && Array.isArray(identities) && identities.length === 0,
    }
  }, [client])

  const resendConfirmation = useCallback(
    async (email: string) => {
      if (!client) {
        throw new Error('Supabase is not configured.')
      }
      const { error } = await client.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: getAuthEmailRedirectTo() },
      })
      if (error) {
        throw error
      }
    },
    [client],
  )

  const signOut = useCallback(async () => {
    if (!client) {
      return
    }
    const { error } = await client.auth.signOut()
    if (error) {
      throw error
    }
  }, [client])

  const updateProfile = useCallback(async (update: ProfileUpdate) => {
    if (!client) {
      throw new Error('Supabase is not configured.')
    }
    const data: Record<string, string> = {}
    if (update.fullName !== undefined) {
      data.full_name = update.fullName
    }
    if (update.avatarUrl !== undefined) {
      data.avatar_url = update.avatarUrl
    }
    if (update.timezone !== undefined) {
      data.timezone = update.timezone
    }
    if (update.viewStyle !== undefined) {
      data.view_style = update.viewStyle
    }
    if (update.font !== undefined) {
      Object.assign(data, fontUpdate(update.font.role, update.font.id))
    }
    if (update.navOrder !== undefined) {
      Object.assign(data, navOrderUpdate(update.navOrder))
    }
    if (update.defaultPage !== undefined) {
      /*
       * The current metadata goes in because a space's choice is merged into a single string holding
       * every space's — writing it blind would drop the others.
       *
       * Read through the ref, not from the closure. This callback's dependency is `client`, which
       * never changes, so it is built once — on the first render, when there is no session yet. A
       * captured `session` would therefore be null forever, `readSpaceDefaults` would see nothing,
       * and setting one space's page would silently wipe every other space's.
       */
      Object.assign(
        data,
        defaultPageUpdate(
          update.defaultPage,
          update.defaultPageSpaceId ?? null,
          sessionRef.current?.user?.user_metadata as Record<string, unknown> | undefined,
        ),
      )
    }
    if (update.tilesPerRow !== undefined && update.tilesPerRowBand !== undefined) {
      // One key per screen size (see tilesPerRowUpdate). The legacy account-wide key is left
      // exactly where it is: it is still read as the starting point for a band nobody has set,
      // and overwriting it here would make one screen's choice leak into all the others again.
      Object.assign(data, tilesPerRowUpdate(update.tilesPerRowBand, update.tilesPerRow))
    }
    const { data: result, error } = await client.auth.updateUser({ data })
    if (error) {
      throw error
    }
    // onAuthStateChange fires a USER_UPDATED event too, but applying it here directly
    // avoids a flash of stale data while that round-trip is still in flight.
    setSession((current) => (current ? { ...current, user: result.user } : current))
  }, [client])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured: client !== null,
      signIn,
      signUp,
      resendConfirmation,
      signOut,
      updateProfile,
    }),
    [client, loading, resendConfirmation, session, signIn, signOut, signUp, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider.')
  }
  return value
}
