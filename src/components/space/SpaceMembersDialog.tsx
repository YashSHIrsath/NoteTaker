import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { SpaceAvatar } from './SpaceAvatar'
import { SpaceSettingsPanel } from './SpaceSettingsPanel'
import type { SpaceSummary } from '../../types'

export interface SpaceMembersDialogProps {
  open: boolean
  space: SpaceSummary
  /** The signed-in account, so it can tell "you" apart from everyone else. */
  currentUserId: string | null
  onClose: () => void
  /** Called after anything that changes who is in the space, so the list outside can catch up. */
  onChanged: () => void
  /** Opens the invite flow. Kept outside this dialog so one invite screen serves both entry points. */
  onInvite?: () => void
}

/**
 * The space's settings, as a dialog — the wide-screen presentation, opened from the sidebar footer.
 *
 * Everything inside it is SpaceSettingsPanel, which is also the space's own page below `lg`. On a
 * phone this was the only way to reach any of it, which put the space's identity, its people and
 * their roles behind a popup over the notes; there the account tab goes to the page instead. The
 * two are the same component so they cannot drift.
 */
export function SpaceMembersDialog({
  open,
  space,
  currentUserId,
  onClose,
  onChanged,
  onInvite,
}: SpaceMembersDialogProps) {
  const titleId = useId()

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

  return createPortal(
    <div
      /*
       * Portalled to the body, and scrollable from the top rather than centred.
       *
       * Two separate things went wrong here. `fixed inset-0` is only relative to the viewport while
       * no ancestor has a transform — and a page arriving under anim-page-enter has one — so the
       * overlay was being contained by the page content instead of covering the screen. And
       * `items-center` on a dialog taller than the space available overflows it equally above and
       * below, which is what cut the heading off the top rather than scrolling the body.
       *
       * items-start with the container scrolling means the top can never be clipped; sm:items-center
       * still centres it whenever there is room. Same reasoning as the menus, which portal for
       * exactly this reason.
       */
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-dialog-in relative my-auto flex max-h-[min(90vh,38rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        {/* shrink-0, and the body below owns the scrolling.
          *
          * Without it flexbox treats this row as shrinkable and, on a short viewport, squeezes the
          * title and close button to nothing while the form runs off the top of the screen — which
          * is precisely how this dialog appeared with no heading and a clipped first field. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <SpaceAvatar
              spaceId={space.id}
              color={space.color}
              imageUrl={space.imageUrl}
              className="h-8 w-8"
              iconClassName="h-4 w-4"
            />
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-[var(--color-text)]">
              {space.name}
            </h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <SpaceSettingsPanel
            space={space}
            currentUserId={currentUserId}
            onChanged={onChanged}
            onInvite={
              onInvite
                ? () => {
                    onClose()
                    onInvite()
                  }
                : undefined
            }
            onLeft={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
