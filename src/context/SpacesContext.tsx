import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getSpacesRepository, RepositoryError } from '../repositories'
import { shouldApplySessionResult } from '../lib/persistGuard'
import { clearPendingInvite, readPendingInvite } from '../lib/pendingInvite'
import type {
  IncomingSpaceInvite,
  SpaceRole,
  SpaceSummary,
} from '../types'
import { useAuth } from '../hooks/useAuth'

export interface SpacesContextValue {
  /** Spaces this account owns. "Mine" on the Shared Spaces page. */
  owned: SpaceSummary[]
  /** Spaces this account was let into. "Joined". */
  joined: SpaceSummary[]
  /** Invitations waiting for an answer. */
  invites: IncomingSpaceInvite[]
  /** One space by id, for anything that needs its name or colour. */
  getSpace: (spaceId: string) => SpaceSummary | undefined
  loading: boolean
  /** Set when a read failed. The page says so rather than showing an empty state, which would
   *  read as "you have no spaces" — a very different thing from "we couldn't ask". */
  error: string | null
  /** True when there is no server to ask, so spaces cannot exist in this build at all. */
  unavailable: boolean
  refresh: () => Promise<void>
  createSpace: (name: string, color: string | null) => Promise<SpaceSummary>
  invite: (spaceId: string, email: string, role: SpaceRole) => Promise<string>
  respondToInvite: (args: { accept: boolean; inviteId?: string; token?: string }) => Promise<string>
  leaveSpace: (spaceId: string) => Promise<void>
  /** Display settings the whole space shares. Folded straight into the list, so the bar and the
   *  note style change for the person who made the change without waiting for a re-read. */
  setDisplaySettings: (
    spaceId: string,
    settings: { navOrder?: string[]; viewStyle?: string },
  ) => Promise<void>
  /** The space's own identity — admin only, enforced in the database. */
  setProfile: (
    spaceId: string,
    profile: {
      name?: string
      description?: string | null
      color?: string | null
      imageUrl?: string | null
    },
  ) => Promise<void>
}

export const SpacesContext = createContext<SpacesContextValue | null>(null)

/**
 * Which spaces exist for this account, loaded once per session.
 *
 * Mounted above both workspace subtrees, because two very different things need it: the Shared
 * Spaces page, which lists them, and the space shell itself, which needs a space's name and colour
 * to render the identity. Neither can be the thing that supplies it.
 *
 * Deliberately not part of FolderProvider. That one is scoped to a single workspace and is
 * remounted as you move between them; this list spans all of them and must not reload every time
 * you open one.
 */
export function SpacesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const repository = getSpacesRepository()
  const [spaces, setSpaces] = useState<SpaceSummary[]>([])
  const [invites, setInvites] = useState<IncomingSpaceInvite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const load = useCallback(async () => {
    if (!repository || !userIdRef.current) {
      setSpaces([])
      setInvites([])
      return
    }
    const requestUserId = userIdRef.current
    setLoading(true)
    try {
      // Together: the page shows both lists at once, and one arriving before the other makes the
      // empty state flash for anyone whose only connection to a space is an invitation.
      const [nextSpaces, nextInvites] = await Promise.all([
        repository.listSpaces(),
        repository.listIncomingInvites(),
      ])
      if (
        !shouldApplySessionResult({
          cancelled: false,
          requestUserId,
          currentUserId: userIdRef.current,
        })
      ) {
        return
      }
      setSpaces(nextSpaces)
      setInvites(nextInvites)
      setError(null)
    } catch (caught) {
      if (
        !shouldApplySessionResult({
          cancelled: false,
          requestUserId,
          currentUserId: userIdRef.current,
        })
      ) {
        return
      }
      setError(
        caught instanceof RepositoryError ? caught.message : 'Could not load your shared spaces.',
      )
    } finally {
      setLoading(false)
    }
  }, [repository])

  useEffect(() => {
    if (!userId) {
      setSpaces([])
      setInvites([])
      setError(null)
      return
    }
    void load()
  }, [load, userId])

  /**
   * Redeems an invite token that was parked before signing up.
   *
   * The invite page does this too, when you land on it already signed in. This is the other route:
   * you followed a link, had no account, signed up — possibly in another tab, possibly via an email
   * confirmation that dropped you at "/" — and the token has been waiting in this device's storage
   * ever since. Without it, an invitation sent to one address and accepted by an account with a
   * different one is simply lost.
   *
   * Once per session, and the token is cleared either way: an expired or withdrawn invitation will
   * never work, and retrying it forever is worse than dropping it.
   */
  const claimedRef = useRef(false)
  useEffect(() => {
    if (!userId || !repository || claimedRef.current) {
      return
    }
    const token = readPendingInvite()
    if (!token) {
      return
    }
    claimedRef.current = true
    void repository
      .respondToInvite({ accept: true, token })
      .then(() => {
        clearPendingInvite()
        return load()
      })
      .catch(() => {
        clearPendingInvite()
      })
  }, [load, repository, userId])

  const createSpace = useCallback(
    async (name: string, color: string | null): Promise<SpaceSummary> => {
      if (!repository) {
        throw new RepositoryError('Shared spaces need a server connection.')
      }
      const created = await repository.createSpace(name, color)
      // Folded in rather than re-read: the function returned the row it wrote, and the new space
      // should be on screen before a round trip completes.
      setSpaces((current) => [...current, created])
      return created
    },
    [repository],
  )

  const invite = useCallback(
    async (spaceId: string, email: string, role: SpaceRole): Promise<string> => {
      if (!repository) {
        throw new RepositoryError('Shared spaces need a server connection.')
      }
      const created = await repository.invite(spaceId, email, role)
      return created.token
    },
    [repository],
  )

  const respondToInvite = useCallback(
    async (args: { accept: boolean; inviteId?: string; token?: string }): Promise<string> => {
      if (!repository) {
        throw new RepositoryError('Shared spaces need a server connection.')
      }
      const spaceId = await repository.respondToInvite(args)
      // Answering an invitation changes both lists — the invitation leaves and, on accept, a space
      // arrives — so this is the one place a full re-read is cheaper than reasoning about it.
      await load()
      return spaceId
    },
    [load, repository],
  )

  const leaveSpace = useCallback(
    async (spaceId: string): Promise<void> => {
      if (!repository || !userIdRef.current) {
        throw new RepositoryError('Shared spaces need a server connection.')
      }
      await repository.removeMember(spaceId, userIdRef.current)
      setSpaces((current) => current.filter((space) => space.id !== spaceId))
    },
    [repository],
  )

  const setDisplaySettings = useCallback(
    async (
      spaceId: string,
      settings: { navOrder?: string[]; viewStyle?: string },
    ): Promise<void> => {
      if (!repository) {
        throw new RepositoryError('Shared spaces need a server connection.')
      }
      const updated = await repository.setDisplaySettings(spaceId, settings)
      // Only the two settings are taken from the answer: the function has no business reporting a
      // role or a head count, and the copy already on screen knows both.
      setSpaces((current) =>
        current.map((space) =>
          space.id === spaceId
            ? { ...space, navOrder: updated.navOrder, viewStyle: updated.viewStyle }
            : space,
        ),
      )
    },
    [repository],
  )

  const setProfile = useCallback(
    async (
      spaceId: string,
      profile: {
        name?: string
        description?: string | null
        color?: string | null
        imageUrl?: string | null
      },
    ): Promise<void> => {
      if (!repository) {
        throw new RepositoryError('Shared spaces need a server connection.')
      }
      const updated = await repository.setProfile(spaceId, profile)
      setSpaces((current) =>
        current.map((space) =>
          space.id === spaceId
            ? {
                ...space,
                name: updated.name,
                description: updated.description,
                color: updated.color,
                imageUrl: updated.imageUrl,
              }
            : space,
        ),
      )
    },
    [repository],
  )

  const value = useMemo<SpacesContextValue>(() => {
    const owned = spaces.filter((space) => space.role === 'owner')
    const joined = spaces.filter((space) => space.role !== 'owner')
    return {
      owned,
      joined,
      invites,
      getSpace: (spaceId: string) => spaces.find((space) => space.id === spaceId),
      loading,
      error,
      unavailable: repository === null,
      refresh: load,
      createSpace,
      invite,
      respondToInvite,
      leaveSpace,
      setDisplaySettings,
      setProfile,
    }
  }, [
    createSpace,
    error,
    invite,
    invites,
    leaveSpace,
    load,
    loading,
    repository,
    respondToInvite,
    setDisplaySettings,
    setProfile,
    spaces,
  ])

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>
}
