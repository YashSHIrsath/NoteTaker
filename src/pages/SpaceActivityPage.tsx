import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, History, SearchX } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { IconButton } from '../components/ui/IconButton'
import { Notice } from '../components/ui/Notice'
import { Spinner } from '../components/ui/Spinner'
import { SpaceActivityList } from '../components/space/SpaceActivityList'
import { SpaceActivityFilter } from '../components/space/SpaceActivityFilter'
import { useSpaceActivity, type SpaceActivityFilters } from '../hooks/useSpaceActivity'
import { useSpaceId } from '../hooks/useWorkspace'
import { useSpaces } from '../hooks/useSpaces'
import { usePageEnter } from '../hooks/usePageEnterDirection'
import { getSpacesRepository } from '../repositories'
import type { SpaceMember } from '../types'
import { cn } from '../lib/cn'

/**
 * Everything that has happened in this space, for everyone in it.
 *
 * Not admin-only, deliberately. A log the whole space can see deters far more than one only the owner
 * reads, and hiding it makes a shared workspace feel surveilled rather than shared. It also has a
 * second job that is closer to why people open it: "what changed while I was away". The entry points
 * to it are admin-only — the header button and the card on the space's page — because answering for
 * the space is what makes the record worth reading; a link somebody is handed still works.
 */
export function SpaceActivityPage() {
  const spaceId = useSpaceId()
  const navigate = useNavigate()
  const { getSpace } = useSpaces()
  const [filters, setFilters] = useState<SpaceActivityFilters>({ actorIds: [], actions: [] })
  const { entries, loading, error, hasMore, loadMore } = useSpaceActivity(spaceId, filters)
  const enter = usePageEnter()
  const space = spaceId ? getSpace(spaceId) : undefined

  /*
   * The people to filter by, read once.
   *
   * The feed's own rows only name whoever has done something, so building the list from them would
   * offer a filter that omits the person you suspect has done nothing — and would change as you
   * paged. The membership is the honest list.
   */
  const [members, setMembers] = useState<SpaceMember[]>([])
  useEffect(() => {
    const repository = getSpacesRepository()
    if (!repository || !spaceId) {
      return
    }
    let cancelled = false
    void repository
      .listMembers(spaceId)
      .then((next) => {
        if (!cancelled) {
          setMembers(next)
        }
      })
      .catch(() => {
        // A filter nobody can populate is a filter with no people in it, which the dropdown says.
        // The feed itself is the thing on this page, and it has its own error line.
      })
    return () => {
      cancelled = true
    }
  }, [spaceId])

  const filtering = filters.actorIds.length > 0 || filters.actions.length > 0

  return (
    <div
      // max-w-3xl below lg, where the compact layout has no sidebar and a narrower column reads
      // better; wider from lg, where the shell's own island already gives this page several
      // hundred extra pixels it had no way to use — same ceiling ProfilePage settled on for the
      // same reason (see the masonry note there).
      className={cn(
        'mx-auto w-full max-w-3xl px-4 pb-24 pt-5 sm:px-6 lg:max-w-[74rem] lg:pb-8',
        enter.className,
      )}
      style={enter.style}
    >
      {/* Back, because this is the one page in a space that is not one of the tabs — nothing in the
        * bottom bar or the sidebar is lit while you are here, so without this the only way out is
        * the browser's own gesture. It returns to the space's page, which is where both links to
        * this one live. */}
      <div className="mb-4 flex items-center gap-2">
        <IconButton
          label="Back to this space"
          tooltip="Back"
          onClick={() => navigate(spaceId ? `/s/${spaceId}/profile` : '/')}
          className="-ml-1.5 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--color-text)]">
            Activity
          </h1>
          <p className="mt-0.5 truncate text-[13px] text-[var(--color-text-muted)]">
            Every change in {space?.name ?? 'this space'}, and who made it.
          </p>
        </div>
      </div>

      <div className="mb-4">
        <SpaceActivityFilter members={members} value={filters} onChange={setFilters} />
      </div>

      {error ? (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      {loading && entries.length === 0 ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[var(--color-text-muted)]">
          <Spinner /> Loading…
        </div>
      ) : null}

      {/* Two different empty states, because they mean opposite things: nothing has happened here,
        * or nothing matches what you asked for. Showing "nothing has happened yet" to somebody who
        * has just filtered by one person tells them the space is empty, which it is not. */}
      {!loading && entries.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border-strong)] px-6 py-14 text-center">
          <span
            className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            aria-hidden
          >
            {filtering ? <SearchX className="h-6 w-6" /> : <History className="h-6 w-6" />}
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
            {filtering ? 'Nothing matches that' : 'Nothing has happened yet'}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)]">
            {filtering
              ? 'No change in this space fits the people and kinds you picked. Widen it, or clear the filter.'
              : 'Every change anyone makes in this space shows up here, with their name against it.'}
          </p>
          {filtering ? (
            <div className="mt-4">
              <Button
                variant="subtle"
                size="sm"
                onClick={() => setFilters({ actorIds: [], actions: [] })}
              >
                Clear the filter
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <SpaceActivityList entries={entries} />

      {hasMore && entries.length > 0 ? (
        <div className="mt-4 flex justify-center">
          <Button variant="subtle" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Show earlier'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
