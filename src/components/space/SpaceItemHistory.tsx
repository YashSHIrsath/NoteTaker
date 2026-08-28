import { Spinner } from '../ui/Spinner'
import { SpaceActivityList } from './SpaceActivityList'
import { useSpaceEntityHistory } from '../../hooks/useSpaceActivity'
import { useIsSpace } from '../../hooks/useWorkspace'
import type { SpaceActivityEntity } from '../../types'

export interface SpaceItemHistoryProps {
  entityType: SpaceActivityEntity
  entityId: string
  /** Read on demand: this grows without bound and is only ever looked at for the item whose panel
   *  is actually open. */
  open: boolean
}

/**
 * One item's own history, in a shared space.
 *
 * Sits beside TaskHistoryPanel rather than replacing it, because the two answer different questions
 * about the same note. That one is about its schedule — when it was due, whether a reminder went out
 * — and is written by the scheduling triggers for personal and shared notes alike. This one is about
 * people: who renamed it, who moved it, who ticked it off.
 *
 * Renders nothing at all in personal notes. Not hidden by a flag — there is genuinely nothing to
 * show, since the activity triggers skip any row that does not belong to a space.
 */
export function SpaceItemHistory({ entityType, entityId, open }: SpaceItemHistoryProps) {
  const inSpace = useIsSpace()
  const { entries, loading, error } = useSpaceEntityHistory(entityType, entityId, open && inSpace)

  if (!inSpace) {
    return null
  }

  if (loading && entries.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
        <Spinner /> Loading who changed this…
      </div>
    )
  }

  if (error) {
    return <p className="mt-3 text-[12px] text-[var(--color-danger)]">{error}</p>
  }

  if (entries.length === 0) {
    return null
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        In this space
      </p>
      {/* The entity name and path are dropped: every line here is about the same note, and repeating
        *  its title on each one is noise rather than information. */}
      <SpaceActivityList entries={entries} showEntity={false} />
    </div>
  )
}
