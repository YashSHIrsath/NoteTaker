import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Check, MoreHorizontal } from 'lucide-react'
import { SpaceAvatar } from './SpaceAvatar'
import { useSpaces } from '../../hooks/useSpaces'
import { useWorkspace } from '../../hooks/useWorkspace'
import { ROLE_LABELS } from '../../lib/spaceRoles'
import { cn } from '../../lib/cn'

export interface SpacesMenuProps {
  open: boolean
  onClose: () => void
}

/**
 * Every space you can be in, from the button in the header — on a phone.
 *
 * Switching and leaving, and nothing else. It used to also carry the space's identity, its people
 * and its settings, which made a popup the place you went to read about a space; that now has a
 * page of its own (the account tab, inside a space). What is left is the one job a menu is good at:
 * pick where to go.
 *
 * Anchored under the header rather than rising from the bottom bar, because the control that opens
 * it is up there — a panel that appears somewhere other than the thing you pressed reads as a
 * different object arriving.
 */
export function SpacesMenu({ open, onClose }: SpacesMenuProps) {
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const { owned, joined } = useSpaces()
  const spaces = [...owned, ...joined]
  const currentId = workspace.kind === 'space' ? workspace.id : null

  /*
   * Five, and a way to the rest.
   *
   * A menu is for picking, not for browsing: past about five rows you are reading a list, and the
   * page that exists for reading the list does it better — with mine and joined apart, descriptions,
   * and the controls for each one. So this shows the ones you would actually be switching between
   * and hands the rest over.
   */
  const SHOWN = 5
  const visible = spaces.slice(0, SHOWN)
  const overflow = spaces.length - visible.length

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close spaces"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spaces"
        className={cn(
          'anim-dialog-in absolute right-3 flex max-h-[70dvh] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-y-auto',
          // Below the header, whose height is the safe-area inset plus its own row.
          'top-[calc(env(safe-area-inset-top)+3.25rem)]',
          'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-lg)]',
        )}
      >
        {spaces.length === 0 ? (
          <p className="px-2.5 py-2 text-[13px] text-[var(--color-text-muted)]">No spaces yet</p>
        ) : (
          visible.map((space) => {
            const active = space.id === currentId
            return (
              <button
                key={space.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => go(`/s/${space.id}`)}
                className={cn(
                  'anim-press flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                )}
              >
                <SpaceAvatar
                  spaceId={space.id}
                  color={space.color}
                  imageUrl={space.imageUrl}
                  className="h-8 w-8"
                  iconClassName="h-4 w-4"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{space.name}</span>
                  <span
                    className={cn(
                      'block truncate text-[11.5px]',
                      active ? 'opacity-80' : 'text-[var(--color-text-muted)]',
                    )}
                  >
                    {ROLE_LABELS[space.role]}
                    {space.memberCount > 1 ? ` · ${space.memberCount} people` : ''}
                  </span>
                </span>
                {active ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
              </button>
            )
          })
        )}

        {/* Only when there is a rest to go to. With five or fewer spaces this menu is already the
          * whole list, and a row leading to the same thing you are looking at is noise. Leaving a
          * space is the door in the header beside this, not an entry in here. */}
        {overflow > 0 ? (
          <div className="mt-1 flex flex-col border-t border-[var(--color-border)] pt-1">
            <button
              type="button"
              onClick={() => go('/spaces')}
              className="anim-press flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                aria-hidden
              >
                <MoreHorizontal className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {overflow === 1 ? '1 more space' : `${overflow} more spaces`}
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
