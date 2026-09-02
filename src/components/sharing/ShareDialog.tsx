import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Globe, Loader2, Lock, Users, X } from 'lucide-react'
import type {
  ContentSharing,
  ContentVisibility,
  FolderVisibilityImpact,
  ShareableEntity,
  SpaceMember,
} from '../../types'
import {
  VISIBILITY_LABELS,
  VISIBILITY_LEVELS,
  VISIBILITY_SUMMARY,
  describeNotificationReach,
} from '../../lib/contentPrivacy'
import { getSpacesRepository } from '../../repositories'
import { RepositoryError } from '../../repositories/errors'
import { useFolders } from '../../hooks/useFolders'
import { useSpaceId } from '../../hooks/useWorkspace'
import { useAuth } from '../../hooks/useAuth'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { cn } from '../../lib/cn'

export interface ShareDialogProps {
  open: boolean
  entityType: ShareableEntity
  entityId: string
  /** What the thing is called, for the heading. Nothing is decided from it. */
  entityName: string
  onClose: () => void
  /** Fired after a change lands, so a caller holding its own copy can catch up. */
  onChanged?: (sharing: ContentSharing) => void
}

const ICONS = { private: Lock, restricted: Users, space: Globe } as const

/** Initials for a member with no picture. Two letters at most — three is a monogram, not a hint. */
function initialsOf(member: SpaceMember): string {
  const source = member.fullName?.trim() || member.email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').concat(parts.length > 1 ? (parts[1]?.[0] ?? '') : '').toUpperCase()
}

/**
 * "Who can see this?" — the whole of per-item privacy, as one question.
 *
 * Three options and a list of people, and deliberately nothing else. There is no role vocabulary
 * here, no mention of policies, and no separate notifications tab: the sentence under the member list
 * says that choosing somebody also decides who gets the reminders, because those being one decision
 * is the single thing about this system a person would not otherwise expect.
 *
 * Everything it shows is advisory and everything it does is checked again on the server. Two places
 * that matters. The dialog opens on a *fresh* read rather than the loaded workspace — somebody else
 * may have changed the audience since this tab last looked, and the list of names is the thing being
 * edited. And the picker is hidden rather than disabled for a non-owner, because "you cannot change
 * this" is better said by not offering it than by a greyed-out control that invites a click; the
 * server would refuse them anyway (set_content_visibility admits only the owner).
 */
export function ShareDialog({
  open,
  entityType,
  entityId,
  entityName,
  onClose,
  onChanged,
}: ShareDialogProps) {
  const titleId = useId()
  const { setContentVisibility, readSharing, readFolderVisibilityImpact } = useFolders()
  const spaceId = useSpaceId()
  const { user } = useAuth()
  const spacesRepository = getSpacesRepository()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState<ContentSharing | null>(null)
  const [members, setMembers] = useState<SpaceMember[]>([])
  const [visibility, setVisibility] = useState<ContentVisibility>('space')
  const [selected, setSelected] = useState<string[]>([])
  const [impact, setImpact] = useState<FolderVisibilityImpact | null>(null)

  /* Everybody but you. The owner is not a row in the grant table and never needs selecting — see the
     migration's note on holding ownership separately from sharing. */
  const others = useMemo(
    () => members.filter((member) => member.userId !== user?.id),
    [members, user?.id],
  )

  useEffect(() => {
    if (!open || !spaceId || !spacesRepository) {
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all([readSharing(entityType, entityId), spacesRepository.listMembers(spaceId)])
      .then(([current, memberList]) => {
        if (cancelled) {
          return
        }
        setMembers(memberList)
        setSharing(current)
        setVisibility(current?.visibility ?? 'space')
        setSelected(current?.sharedWith ?? [])
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return
        }
        setError(
          caught instanceof RepositoryError ? caught.message : 'Could not load who can see this.',
        )
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entityId, entityType, open, readSharing, spaceId, spacesRepository])

  /*
   * What opening this folder up would reveal, fetched when the choice is actually being made.
   *
   * Only for a folder, and only when widening. A restricted child cannot be exposed by this — a child
   * is as visible as the least visible thing above it, so widening a parent reaches exactly the
   * children that carry no restriction of their own. That is still worth saying out loud, because
   * "share this folder" is a decision about a container and people think in containers.
   */
  useEffect(() => {
    if (!open || entityType !== 'folder' || !sharing) {
      return
    }
    const widening = visibility !== 'private' && sharing.visibility === 'private'
    const openingUp = visibility === 'space' && sharing.visibility !== 'space'
    if (!widening && !openingUp) {
      setImpact(null)
      return
    }
    let cancelled = false
    void readFolderVisibilityImpact(entityId)
      .then((next) => {
        if (!cancelled) {
          setImpact(next)
        }
      })
      .catch(() => {
        /* An advisory count that cannot be fetched is simply not shown — it must never be the thing
           standing between somebody and a change they are allowed to make. */
      })
    return () => {
      cancelled = true
    }
  }, [entityId, entityType, open, readFolderVisibilityImpact, sharing, visibility])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open, saving])

  const toggleMember = useCallback((userId: string) => {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
  }, [])

  const handleSave = useCallback(() => {
    if (saving) {
      return
    }
    setSaving(true)
    setError(null)
    void setContentVisibility(entityType, entityId, visibility, selected)
      .then((resolved) => {
        onChanged?.(resolved)
        onClose()
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof RepositoryError
            ? caught.message
            : 'Could not change who can see this.',
        )
      })
      .finally(() => {
        setSaving(false)
      })
  }, [entityId, entityType, onChanged, onClose, saving, selected, setContentVisibility, visibility])

  if (!open) {
    return null
  }

  const canManage = sharing?.canManage ?? false
  /* The level the server will actually store. "Selected people" with nobody chosen is "Only me" —
     coerced in set_content_visibility, and said here so the footer never promises otherwise. */
  const effective: ContentVisibility =
    visibility === 'restricted' && selected.length === 0 ? 'private' : visibility
  const unchanged =
    sharing !== null &&
    effective === sharing.visibility &&
    selected.length === sharing.sharedWith.length &&
    selected.every((id) => sharing.sharedWith.includes(id))

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={saving ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-dialog-in relative my-auto flex max-h-[min(90vh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold text-[var(--color-text)]">
              Who can see this?
            </h2>
            <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-text-muted)]">
              {entityName}
            </p>
          </div>
          <IconButton label="Close" onClick={saving ? undefined : onClose} disabled={saving}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--color-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading…
            </div>
          ) : (
            <>
              {canManage ? (
                <div role="radiogroup" aria-label="Who can see this" className="flex flex-col gap-1.5">
                  {VISIBILITY_LEVELS.map((level) => {
                    const Icon = ICONS[level]
                    const active = visibility === level
                    return (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={saving}
                        onClick={() => setVisibility(level)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                            : 'border-[var(--color-border)] hover:bg-[var(--color-hover)]',
                        )}
                      >
                        <span
                          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{
                            background: active
                              ? 'var(--color-surface)'
                              : 'var(--color-surface-muted)',
                          }}
                          aria-hidden
                        >
                          <Icon
                            className="h-3.5 w-3.5"
                            style={{
                              color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
                            }}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-[var(--color-text)]">
                            {VISIBILITY_LABELS[level]}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--color-text-muted)]">
                            {VISIBILITY_SUMMARY[level]}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* Not yours to change. Said plainly rather than shown as a disabled picker — the
                   database refuses anybody but the owner, and a control that cannot work is worse
                   than no control. */
                <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2.5 text-[13px] text-[var(--color-text-muted)]">
                  {sharing
                    ? `This is set to “${VISIBILITY_LABELS[sharing.visibility]}”. Only the person who created it can change that.`
                    : 'You cannot change who sees this.'}
                </p>
              )}

              {visibility === 'restricted' ? (
                <div className="mt-4">
                  <p className="text-[12.5px] font-medium text-[var(--color-text-muted)]">
                    People in this space
                  </p>
                  <div className="mt-2 flex flex-col gap-1">
                    {others.length === 0 ? (
                      <p className="py-2 text-[13px] text-[var(--color-text-muted)]">
                        Nobody else is in this space yet.
                      </p>
                    ) : (
                      others.map((member) => {
                        const checked = selected.includes(member.userId)
                        return (
                          <button
                            key={member.userId}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            disabled={saving || !canManage}
                            onClick={() => toggleMember(member.userId)}
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                              'hover:bg-[var(--color-hover)] disabled:opacity-60',
                            )}
                          >
                            {member.avatarUrl ? (
                              <img
                                src={member.avatarUrl}
                                alt=""
                                className="h-7 w-7 shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <span
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-[var(--color-text-muted)]"
                                style={{ background: 'var(--color-surface-muted)' }}
                                aria-hidden
                              >
                                {initialsOf(member)}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-[var(--color-text)]">
                                {member.fullName?.trim() || member.email}
                              </span>
                              {member.fullName?.trim() ? (
                                <span className="block truncate text-[11.5px] text-[var(--color-text-muted)]">
                                  {member.email}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={cn(
                                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                                checked
                                  ? 'border-transparent bg-[var(--color-accent)] text-white'
                                  : 'border-[var(--color-border-strong)]',
                              )}
                              aria-hidden
                            >
                              {checked ? <Check className="h-3.5 w-3.5" /> : null}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              ) : null}

              <p className="mt-4 text-[12.5px] leading-snug text-[var(--color-text-muted)]">
                {describeNotificationReach(effective, selected.length)}
              </p>

              {impact && (impact.openFolders > 0 || impact.openTasks > 0) ? (
                <p className="mt-2 rounded-lg bg-[var(--color-surface-muted)] px-3 py-2 text-[12.5px] leading-snug text-[var(--color-text-muted)]">
                  {impact.openTasks > 0 ? `${impact.openTasks} note${impact.openTasks === 1 ? '' : 's'}` : ''}
                  {impact.openTasks > 0 && impact.openFolders > 0 ? ' and ' : ''}
                  {impact.openFolders > 0
                    ? `${impact.openFolders} folder${impact.openFolders === 1 ? '' : 's'}`
                    : ''}{' '}
                  inside will become visible too.
                  {impact.keptPrivate > 0
                    ? ` ${impact.keptPrivate} item${impact.keptPrivate === 1 ? '' : 's'} set to something narrower will stay that way.`
                    : ''}
                </p>
              ) : null}

              {error ? (
                <p className="mt-3 text-[12.5px] text-[var(--color-danger)]" role="alert">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="subtle" size="sm" onClick={onClose} disabled={saving}>
            {canManage ? 'Cancel' : 'Close'}
          </Button>
          {canManage ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || loading || unchanged}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
