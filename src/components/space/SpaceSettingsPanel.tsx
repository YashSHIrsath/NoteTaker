import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Camera, Check, Clock, LogOut, UserPlus, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Notice } from '../ui/Notice'
import { Spinner } from '../ui/Spinner'
import { Select } from '../ui/Select'
import { getSpacesRepository, RepositoryError } from '../../repositories'
import {
  INVITABLE_ROLES,
  SPACE_ROLES,
  type SpaceInvite,
  type SpaceMember,
  type SpaceRole,
  type SpaceSummary,
  type TaskPaletteColor,
} from '../../types'
import { ROLE_LABELS, roleCanManageMembers } from '../../lib/spaceRoles'
import { SPACE_COLORS, spaceSwatch } from '../../lib/spaceColor'
import { SpaceAvatar } from './SpaceAvatar'
import { SpaceNotificationSettings } from './SpaceNotificationSettings'
import { uploadSpaceImage } from '../../services/profile/spaceImageUpload'
import { useSpaces } from '../../hooks/useSpaces'
import { cn } from '../../lib/cn'

export interface SpaceSettingsPanelProps {
  space: SpaceSummary
  /** The signed-in account, so it can tell "you" apart from everyone else. */
  currentUserId: string | null
  /** Called after anything that changes who is in the space, so the list outside can catch up. */
  onChanged: () => void
  /** Opens the invite flow. Kept outside this panel so one invite screen serves every entry point. */
  onInvite?: () => void
  /** Called once leaving has succeeded — there is nothing here to return to afterwards. */
  onLeft?: () => void
}

function initials(member: SpaceMember): string {
  return (member.fullName?.trim() || member.email || '?').charAt(0).toUpperCase()
}

/** The heading each role gets when the people are grouped under it. */
const GROUP_LABELS: Record<SpaceRole, string> = {
  owner: 'Owner',
  admin: 'Admins',
  editor: 'Editors',
  viewer: 'Viewers',
}

/**
 * What a space is, and who is in it.
 *
 * Every control here is drawn from the role the database reports, but nothing here is what enforces
 * it: the policies refuse a write from a viewer, an edit to an owner's row and a removal by an
 * editor whatever this component renders. Hiding a button the server would reject is a courtesy,
 * not a permission.
 *
 * Kept separate from the dialog that used to hold it because it is now two things: the space's own
 * page on a phone — where the account tab leads here rather than to a popup — and the panel inside
 * that dialog on a wide screen, where the sidebar footer still opens it.
 */
export function SpaceSettingsPanel({
  space,
  currentUserId,
  onChanged,
  onInvite,
  onLeft,
}: SpaceSettingsPanelProps) {
  const repository = getSpacesRepository()
  const { setProfile } = useSpaces()
  const [description, setDescription] = useState(space.description ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploading, setUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [members, setMembers] = useState<SpaceMember[]>([])
  const [invites, setInvites] = useState<SpaceInvite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const fieldId = useId()
  const canManage = roleCanManageMembers(space.role)

  const load = useCallback(async () => {
    if (!repository) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Outstanding invitations sit beside the people who accepted, because "who is in this space"
      // includes the ones you are still waiting on — otherwise re-inviting the same person looks
      // like the only way to check.
      const [nextMembers, nextInvites] = await Promise.all([
        repository.listMembers(space.id),
        canManage ? repository.listPendingInvites(space.id) : Promise.resolve([]),
      ])
      setMembers(nextMembers)
      setInvites(nextInvites)
    } catch (caught) {
      setError(caught instanceof RepositoryError ? caught.message : 'Could not load this space.')
    } finally {
      setLoading(false)
    }
  }, [canManage, repository, space.id])

  useEffect(() => {
    void load()
  }, [load])

  /*
   * Reset from the space whenever it changes underneath, so somebody else's edit to the note shows
   * up rather than being overwritten by whatever was sitting in this field.
   *
   * Adjusted during render rather than in an effect: it tracks the last value that arrived, so a
   * change *from the server* resets the field while your own unsaved typing — which differs from
   * `space.description` too — is left alone.
   */
  const [syncedDescription, setSyncedDescription] = useState(space.description ?? '')
  if ((space.description ?? '') !== syncedDescription) {
    setSyncedDescription(space.description ?? '')
    setDescription(space.description ?? '')
  }

  const saveProfile = async (profile: {
    description?: string | null
    color?: string | null
    imageUrl?: string | null
  }) => {
    setSavingProfile(true)
    setError(null)
    try {
      await setProfile(space.id, profile)
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this space.')
    } finally {
      setSavingProfile(false)
    }
  }

  const pickImage = async (file: File | undefined) => {
    if (!file) {
      return
    }
    setUploading(true)
    setError(null)
    try {
      const url = await uploadSpaceImage(space.id, file)
      await setProfile(space.id, { imageUrl: url })
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the picture.')
    } finally {
      setUploading(false)
    }
  }

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusyId(key)
    setError(null)
    try {
      await action()
      await load()
      onChanged()
    } catch (caught) {
      setError(caught instanceof RepositoryError ? caught.message : 'That did not work.')
    } finally {
      setBusyId(null)
    }
  }

  /*
   * Grouped by role rather than listed flat.
   *
   * "Who can do what here" is the question this list is actually asked, and a flat list answers it
   * one row at a time — you have to read every badge and hold the tally yourself. Under headings the
   * shape of the space is the first thing you see. Owner first, then down the permissions.
   */
  const groups = SPACE_ROLES.map((role) => ({
    role,
    people: members.filter((member) => member.role === role),
  })).filter((group) => group.people.length > 0)

  const renderMember = (member: SpaceMember) => {
    const isSelf = member.userId === currentUserId
    // The owner's row is untouchable through the API in both directions, so it is not offered here
    // either. Handing a space over is its own deliberate act.
    const editable = canManage && member.role !== 'owner'
    return (
      <li
        key={member.userId}
        className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] px-3 py-2"
      >
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))' }}
            aria-hidden
          >
            {initials(member)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-[var(--color-text)]">
            {member.fullName?.trim() || member.email}
            {isSelf ? <span className="ml-1 font-normal text-[var(--color-text-muted)]">(you)</span> : null}
          </span>
          <span className="block truncate text-[12px] text-[var(--color-text-muted)]">
            {member.email}
          </span>
        </span>

        {editable ? (
          <Select
            value={member.role}
            disabled={busyId === member.userId}
            onChange={(role) =>
              void run(member.userId, () => repository!.setMemberRole(space.id, member.userId, role))
            }
            options={INVITABLE_ROLES.map((option) => ({ value: option, label: ROLE_LABELS[option] }))}
            aria-label={`Role for ${member.email}`}
            className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-1 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
        ) : null}

        {editable && !isSelf ? (
          <IconButton
            label={`Remove ${member.email}`}
            onClick={() => void run(member.userId, () => repository!.removeMember(space.id, member.userId))}
            disabled={busyId === member.userId}
          >
            <X className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {/* ---------------------------------------------------------- what this space is
        *
        * The picture, the note and the colour. Admin and owner only — how a space looks to work in
        * is everyone's, but what it *is* should not change under the people using it. Everyone else
        * sees the note read-only, which is the part that answers "what is this for".
        */}
      {canManage ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] p-3">
          <div className="flex items-center gap-3">
            <SpaceAvatar
              spaceId={space.id}
              color={space.color}
              imageUrl={space.imageUrl}
              className="h-12 w-12"
              iconClassName="h-5 w-5"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  void pickImage(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="subtle"
                  size="sm"
                  disabled={uploading || savingProfile}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5" aria-hidden />
                    {uploading ? 'Uploading…' : space.imageUrl ? 'Change picture' : 'Add picture'}
                  </span>
                </Button>
                {space.imageUrl ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={uploading || savingProfile}
                    onClick={() => void saveProfile({ imageUrl: null })}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
                Without one, the space keeps its colour — which is also what tints the app while
                you're inside it.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Space colour">
            {SPACE_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={space.color === option}
                aria-label={option}
                disabled={savingProfile}
                onClick={() => void saveProfile({ color: option as TaskPaletteColor })}
                className={cn(
                  'anim-press inline-flex h-6 w-6 items-center justify-center rounded-full transition-transform',
                  space.color === option
                    ? 'ring-2 ring-[var(--color-text)] ring-offset-2 ring-offset-[var(--color-surface)]'
                    : 'ring-1 ring-[var(--color-border)]',
                )}
                style={{ background: spaceSwatch(option) }}
              >
                {space.color === option ? <Check className="h-3 w-3 text-white" aria-hidden /> : null}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor={`${fieldId}-description`}
              className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
            >
              What this space is for
            </label>
            <textarea
              id={`${fieldId}-description`}
              rows={2}
              value={description}
              disabled={savingProfile}
              placeholder="Everything for the Q3 launch — copy, deadlines, sign-offs."
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => {
                // Saved on blur rather than on every keystroke: this is a sentence somebody writes
                // once, and a note that saved mid-word would be a note everyone else watched being
                // typed.
                if ((space.description ?? '') !== description.trim()) {
                  void saveProfile({ description: description.trim() || null })
                }
              }}
              className="mt-1.5 w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            />
          </div>
        </div>
      ) : space.description ? (
        <p className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          {space.description}
        </p>
      ) : null}

      {/* ---------------------------------------------------------- who is here */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          {members.length === 1 ? '1 person' : `${members.length} people`}
        </p>
        {canManage && onInvite ? (
          <Button variant="subtle" size="sm" onClick={onInvite}>
            <span className="inline-flex items-center gap-1.5">
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Add someone
            </span>
          </Button>
        ) : null}
      </div>

      {loading && members.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--color-text-muted)]">
          <Spinner /> Loading…
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.role} className="flex flex-col gap-1.5">
          <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {GROUP_LABELS[group.role]}
            <span className="ml-1.5 font-normal tabular-nums opacity-70">{group.people.length}</span>
          </p>
          <ul className="flex flex-col gap-1.5">{group.people.map(renderMember)}</ul>
        </div>
      ))}

      {invites.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="mt-1 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Waiting to accept
          </p>
          <ul className="flex flex-col gap-1.5">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center gap-2.5 rounded-xl border border-dashed border-[var(--color-border-strong)] px-3 py-2"
              >
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-hover)] text-[var(--color-text-muted)]"
                  aria-hidden
                >
                  <Clock className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-[var(--color-text)]">
                    {invite.email}
                  </span>
                  <span className="block text-[12px] text-[var(--color-text-muted)]">
                    Invited as {ROLE_LABELS[invite.role].toLowerCase()}
                  </span>
                </span>
                <IconButton
                  label={`Withdraw the invitation to ${invite.email}`}
                  onClick={() => void run(invite.id, () => repository!.revokeInvite(invite.id))}
                  disabled={busyId === invite.id}
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Yours alone, unlike everything above it — which is why it sits below the membership list
        *  rather than among the space's own settings. */}
      <SpaceNotificationSettings spaceId={space.id} />

      {/* Leaving is deleting your own membership — the same policy that lets an admin remove
        *  somebody else, which is why the owner cannot do it without handing the space over. */}
      {space.role !== 'owner' && currentUserId ? (
        <div className="mt-2 border-t border-[var(--color-border)] pt-3">
          <Button
            variant="danger"
            size="sm"
            disabled={busyId === 'leave'}
            onClick={() =>
              void run('leave', () => repository!.removeMember(space.id, currentUserId)).then(
                () => onLeft?.(),
              )
            }
          >
            <span className="inline-flex items-center gap-1.5">
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Leave this space
            </span>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
