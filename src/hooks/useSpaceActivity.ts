import { useCallback, useEffect, useRef, useState } from 'react'
import { getSpacesRepository, RepositoryError } from '../repositories'
import type { SpaceActivityAction, SpaceActivityEntity, SpaceActivityEntry } from '../types'

export interface SpaceActivityFilters {
  /** Whose actions to show. Empty means everyone's. */
  actorIds: string[]
  /** Which kinds of change to show. Empty means every kind. */
  actions: SpaceActivityAction[]
}

const NO_FILTERS: SpaceActivityFilters = { actorIds: [], actions: [] }

export interface SpaceActivityState {
  entries: SpaceActivityEntry[]
  loading: boolean
  error: string | null
  /** False once a page comes back short, so the button stops offering more than there is. */
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}

const PAGE_SIZE = 50

/**
 * A space's activity, paged by cursor.
 *
 * By the id of the oldest entry on screen rather than by an offset, because the feed grows at exactly
 * the end being read from: an offset would skip or repeat rows as new activity arrives underneath the
 * reader.
 */
export function useSpaceActivity(
  spaceId: string | null,
  filters: SpaceActivityFilters = NO_FILTERS,
): SpaceActivityState {
  const repository = getSpacesRepository()
  /*
   * The filters are joined into strings before they reach a dependency array.
   *
   * They arrive as fresh arrays on every render — a caller holding them in state and spreading to
   * toggle one is the normal way to write this — and an array in a dependency list compares by
   * identity, so `read` would be rebuilt every render and the effect below would refetch forever.
   * The keys change only when the selection actually does.
   */
  const actorKey = filters.actorIds.join(',')
  const actionKey = filters.actions.join(',')
  const [entries, setEntries] = useState<SpaceActivityEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const inflight = useRef(false)

  const read = useCallback(
    async (beforeId?: number) => {
      if (!repository || !spaceId || inflight.current) {
        return
      }
      inflight.current = true
      setLoading(true)
      try {
        const page = await repository.listActivity(spaceId, {
          beforeId,
          limit: PAGE_SIZE,
          // Split back out of the keys, so this reads the same selection the dependency saw.
          actorIds: actorKey ? actorKey.split(',') : [],
          actions: actionKey ? (actionKey.split(',') as SpaceActivityAction[]) : [],
        })
        setEntries((current) => (beforeId === undefined ? page : [...current, ...page]))
        setHasMore(page.length === PAGE_SIZE)
        setError(null)
      } catch (caught) {
        setError(
          caught instanceof RepositoryError
            ? caught.message
            : 'Could not load what has happened here.',
        )
      } finally {
        setLoading(false)
        inflight.current = false
      }
    },
    [actionKey, actorKey, repository, spaceId],
  )

  // Back to the top whenever the space or the filters change: a cursor from the old selection means
  // nothing in the new one.
  useEffect(() => {
    setEntries([])
    setHasMore(true)
    void read()
  }, [read])

  const loadMore = useCallback(() => {
    const oldest = entries[entries.length - 1]
    if (oldest) {
      void read(oldest.id)
    }
  }, [entries, read])

  const refresh = useCallback(() => {
    setEntries([])
    setHasMore(true)
    void read()
  }, [read])

  return { entries, loading, error, hasMore, loadMore, refresh }
}

/** One item's own history. Read on demand rather than with the document: it is only ever looked at
 *  for the note whose panel is open, and it grows without bound. */
export function useSpaceEntityHistory(
  entityType: SpaceActivityEntity,
  entityId: string | null,
  enabled: boolean,
): { entries: SpaceActivityEntry[]; loading: boolean; error: string | null } {
  const repository = getSpacesRepository()
  const [entries, setEntries] = useState<SpaceActivityEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repository || !entityId || !enabled) {
      setEntries([])
      return
    }
    let cancelled = false
    setLoading(true)
    void repository
      .listEntityHistory(entityType, entityId)
      .then((page) => {
        if (!cancelled) {
          setEntries(page)
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof RepositoryError
              ? caught.message
              : 'Could not load the history for this item.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, entityId, entityType, repository])

  return { entries, loading, error }
}
