import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getAuthEmailRedirectTo } from '../lib/authRedirect'
import { getSupabaseClient } from '../lib/supabase'
import { tilesPerRowUpdate, type TileBandId, type TilesPerRow, type ViewStyle } from '../lib/viewStyle'
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
  defaultPage?: SidebarNavId
  /** Which screen size the tilesPerRow above applies to. Required alongside it. */
  tilesPerRowBand?: TileBandId
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
  updateProfile: (update: ProfileUpdate) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getSupabaseClient()
  const [session, setSession] = useState<Session | null>(null)
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
    return { needsEmailConfirmation: data.session === null }
  }, [client])

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
    if (update.navOrder !== undefined) {
      Object.assign(data, navOrderUpdate(update.navOrder))
    }
    if (update.defaultPage !== undefined) {
      Object.assign(data, defaultPageUpdate(update.defaultPage))
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
      signOut,
      updateProfile,
    }),
    [client, loading, session, signIn, signOut, signUp, updateProfile],
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
