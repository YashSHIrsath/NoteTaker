import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Plus, Settings2, UserPlus, Users } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { IconButton } from '../components/ui/IconButton'
import { Notice } from '../components/ui/Notice'
import { Spinner } from '../components/ui/Spinner'
import { CreateSpaceDialog } from '../components/space/CreateSpaceDialog'
import { InviteMemberDialog } from '../components/space/InviteMemberDialog'
import { SpaceMembersDialog } from '../components/space/SpaceMembersDialog'
import { useSpaces } from '../hooks/useSpaces'
import { useAuth } from '../hooks/useAuth'
import { usePageEnter } from '../hooks/usePageEnterDirection'
import { spaceColorFor, spaceSwatch } from '../lib/spaceColor'
import { SpaceAvatar } from '../components/space/SpaceAvatar'
import { ROLE_LABELS, roleCanManageMembers } from '../lib/spaceRoles'
import { cn } from '../lib/cn'
import type { IncomingSpaceInvite, SpaceSummary } from '../types'

/** One space in a list. Tapping the body walks into it; the controls stay out of that gesture. */
function SpaceRow({
  space,
  onOpen,
  onInvite,
  onManage,
}: {
  space: SpaceSummary
  onOpen: () => void
  onInvite: () => void
  onManage: () => void
}) {
  const canManage = roleCanManageMembers(space.role)
  return (
    <li className="group relative flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 transition-colors hover:bg-[var(--color-hover)]">
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30"
        aria-label={`Open ${space.name}`}
      />
      <SpaceAvatar
        spaceId={space.id}
        color={space.color}
        imageUrl={space.imageUrl}
        className="pointer-events-none h-10 w-10 rounded-xl"
        iconClassName="h-5 w-5"
      />
      <span className="pointer-events-none min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-[var(--color-text)]">
          {space.name}
        </span>
        <span className="block text-[12.5px] text-[var(--color-text-muted)]">
          {ROLE_LABELS[space.role]} &middot;{' '}
          {space.memberCount === 1 ? 'just you' : `${space.memberCount} people`}
        </span>
        {space.description ? (
          <span className="mt-0.5 block truncate text-[12px] text-[var(--color-text-muted)]">
            {space.description}
          </span>
        ) : null}
      </span>
      {canManage ? (
        <span className="relative z-10 flex shrink-0 items-center gap-1">
          <IconButton
            label={`Invite someone to ${space.name}`}
            tooltip="Invite someone"
            onClick={onInvite}
          >
            <UserPlus className="h-4 w-4" />
          </IconButton>
          <IconButton label={`Manage ${space.name}`} tooltip="Manage" onClick={onManage}>
            <Settings2 className="h-4 w-4" />
          </IconButton>
        </span>
      ) : (
        <span className="relative z-10 shrink-0">
          <IconButton label={`People in ${space.name}`} tooltip="People" onClick={onManage}>
            <Users className="h-4 w-4" />
          </IconButton>
        </span>
      )}
    </li>
  )
}

/** An invitation waiting for an answer. */
function InviteRow({
  invite,
  busy,
  onRespond,
}: {
  invite: IncomingSpaceInvite
  busy: boolean
  onRespond: (accept: boolean) => void
}) {
  const color = spaceColorFor(invite.spaceId, invite.spaceColor)
  const who = invite.invitedByName?.trim() || invite.invitedByEmail
  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]/40 p-3 sm:flex-row sm:items-center">
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: spaceSwatch(color) }}
        aria-hidden
      >
        <Mail className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold text-[var(--color-text)]">
          {invite.spaceName}
        </span>
        <span className="block text-[12.5px] leading-snug text-[var(--color-text-muted)]">
          {who} invited you as {ROLE_LABELS[invite.role].toLowerCase()}
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        <Button variant="subtle" size="sm" disabled={busy} onClick={() => onRespond(false)}>
          Decline
        </Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => onRespond(true)}>
          {busy ? 'Joining…' : 'Accept'}
        </Button>
      </span>
    </li>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  )
}

/**
 * Every space this account can reach, and every invitation waiting for it.
 *
 * Mine and Joined are kept apart because they are different relationships, not different sizes of
 * the same one: one is a space you are responsible for, the other is somewhere you were let in.
 * Invitations sit above both — an unanswered question should not be below a list of answered ones.
 */
export function SharedSpacesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { owned, joined, invites, loading, error, unavailable, refresh, createSpace, invite, respondToInvite } =
    useSpaces()
  const [creating, setCreating] = useState(false)
  const [invitingTo, setInvitingTo] = useState<SpaceSummary | null>(null)
  const [managing, setManaging] = useState<SpaceSummary | null>(null)
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [respondError, setRespondError] = useState<string | null>(null)
  const enter = usePageEnter()

  const openSpace = (spaceId: string) => {
    navigate(`/s/${spaceId}`)
  }

  const handleRespond = (inviteId: string, accept: boolean) => {
    setRespondingTo(inviteId)
    setRespondError(null)
    void respondToInvite({ accept, inviteId })
      .then((spaceId) => {
        // Accepting walks straight in. Declining leaves you here, where the list has just changed.
        if (accept) {
          openSpace(spaceId)
        }
      })
      .catch((caught: unknown) => {
        setRespondError(caught instanceof Error ? caught.message : 'That did not work.')
      })
      .finally(() => {
        setRespondingTo(null)
      })
  }

  const nothingAtAll = owned.length === 0 && joined.length === 0 && invites.length === 0

  return (
    <div
      className={cn('mx-auto w-full max-w-3xl px-4 pb-24 pt-5 sm:px-6 lg:pb-8', enter.className)}
      style={enter.style}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">
            Shared spaces
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">
            Notes and tasks several people keep together.
          </p>
        </div>
        {!unavailable ? (
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" aria-hidden />
              New space
            </span>
          </Button>
        ) : null}
      </div>

      {unavailable ? (
        <Notice>
          Shared spaces need a server connection, and this build doesn't have one configured. Your
          own notes work exactly as they always have.
        </Notice>
      ) : null}

      {error ? (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {respondError ? (
        <div className="mb-4">
          <Notice tone="danger">{respondError}</Notice>
        </div>
      ) : null}

      {loading && nothingAtAll ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[var(--color-text-muted)]">
          <Spinner /> Loading your spaces…
        </div>
      ) : null}

      {!loading && !unavailable && nothingAtAll && !error ? (
        /* The empty state says what a space is *for*, because at this point the person has never
         * seen one and the word alone doesn't explain itself. */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border-strong)] px-6 py-14 text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Users className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
            No shared spaces yet
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)]">
            A shared space works exactly like your own notes — the same tree, tasks and deadlines —
            except everyone you invite sees it too, and every change is attributed.
          </p>
          <div className="mt-5">
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                Create your first space
              </span>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {invites.length > 0 ? (
          <Group label={invites.length === 1 ? 'Invitation' : 'Invitations'}>
            {invites.map((item) => (
              <InviteRow
                key={item.id}
                invite={item}
                busy={respondingTo === item.id}
                onRespond={(accept) => handleRespond(item.id, accept)}
              />
            ))}
          </Group>
        ) : null}

        {owned.length > 0 ? (
          <Group label="Mine">
            {owned.map((space) => (
              <SpaceRow
                key={space.id}
                space={space}
                onOpen={() => openSpace(space.id)}
                onInvite={() => setInvitingTo(space)}
                onManage={() => setManaging(space)}
              />
            ))}
          </Group>
        ) : null}

        {joined.length > 0 ? (
          <Group label="Joined">
            {joined.map((space) => (
              <SpaceRow
                key={space.id}
                space={space}
                onOpen={() => openSpace(space.id)}
                onInvite={() => setInvitingTo(space)}
                onManage={() => setManaging(space)}
              />
            ))}
          </Group>
        ) : null}
      </div>

      <CreateSpaceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (name, color) => {
          const created = await createSpace(name, color)
          openSpace(created.id)
        }}
      />

      {invitingTo ? (
        <InviteMemberDialog
          open
          spaceName={invitingTo.name}
          onClose={() => setInvitingTo(null)}
          onInvite={(email, role) => invite(invitingTo.id, email, role)}
        />
      ) : null}

      {managing ? (
        <SpaceMembersDialog
          open
          space={managing}
          currentUserId={user?.id ?? null}
          onClose={() => setManaging(null)}
          onChanged={() => void refresh()}
          onInvite={() => setInvitingTo(managing)}
        />
      ) : null}
    </div>
  )
}
