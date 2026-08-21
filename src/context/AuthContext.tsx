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

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
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

  const signUp = useCallback(async (email: string, password: string) => {
    if (!client) {
      throw new Error('Supabase is not configured.')
    }
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthEmailRedirectTo(),
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

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured: client !== null,
      signIn,
      signUp,
      signOut,
    }),
    [client, loading, session, signIn, signOut, signUp],
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
