import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFolders } from '../../hooks/useFolders'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { useResizablePanel } from '../../hooks/useResizablePanel'
import { IconButton } from '../ui/IconButton'
import { cn } from '../../lib/cn'
import { PinButton } from '../common/PinButton'
import { StarButton } from '../common/StarButton'
import { RowDeleteButton } from '../common/RowDeleteButton'
import { SaveStatusLabel } from './SaveStatusLabel'
import { TaskEditor } from './TaskEditor'
import { SCOPE_LABELS } from './TaskActionsMenu'
import type { TaskListScope } from '../../types'

export interface TaskEditorDialogProps {
  taskId: string
  onClose: () => void
  /**
   * Which listing this dialog was opened from — the page's own tasks, its starred list, or the
   * folder a note lives in. Pinning is per-listing (see Task.pinnedScopes), and the dialog has no
   * way to know this on its own: it is mounted with only a task id, from four different pages that
   * each show a different slice of the account's notes.
   *
   * Defaults to 'folder' for a caller that doesn't pass one — every note belongs to exactly one
   * folder, so it is the one scope always meaningful regardless of where the dialog was opened
   * from, and the one this used unconditionally before this prop existed.
   */
  scope?: TaskListScope
}

/** Kept in step with the .anim-dialog-out / .anim-overlay-out duration in index.css. */
const EXIT_MS = 120

const SIZE_KEY = 'mynotes-task-dialog-size'

/**
 * How small the panel may be dragged.
 *
 * Not a matter of taste. The header alone is five controls in a row, and the editor under it needs
 * enough width for a line of prose to still read as a line. Past this the dialog stops being a
 * smaller window and becomes a broken one — which is not a state worth letting somebody save and
 * then reopen every note into.
 */
const MIN_WIDTH = 420
const MIN_HEIGHT = 320

/**
 * The room the shell keeps around the panel, counted twice.
 *
 * The panel is centred, so it can only grow into what is free on *both* sides — the 16px gutter
 * (`sm:p-4`) at each edge. Letting it past this puts its edges under the window's own, which reads
 * as the dialog having escaped rather than as having been made bigger.
 */
const VIEWPORT_MARGIN = 32

export function TaskEditorDialog({ taskId, onClose, scope = 'folder' }: TaskEditorDialogProps) {
  const { getTask, getFolder, getPath, toggleTaskImportant, toggleTaskPinned, saveStatus } = useFolders()
  const { requestTaskDelete, dialog: deleteDialog } = useDeleteTask()
  const panelRef = useRef<HTMLDivElement>(null)
  // Closing has to be animated before the parent unmounts this, so every close path (header
  // button, backdrop, Escape) goes through requestClose: it plays the exit, then hands over.
  const [closing, setClosing] = useState(false)
  // The Escape listener is registered once, so it captures the first render's requestClose —
  // a ref is what keeps "already closing" true for that stale closure too.
  const closingRef = useRef(false)
  const closeTimerRef = useRef<number | null>(null)
  const task = getTask(taskId)
  const open = task !== undefined

  useDialogFocus(open, panelRef)

  /*
   * Resizing, from `sm` up only.
   *
   * Below it the dialog is the whole screen — there is nothing to resize it relative to, and a
   * grip on every edge would be eight strips of screen that swallow a thumb aimed at the text.
   * The handles are not merely hidden there, they are not mounted. See useResizablePanel for the
   * drag/clamp/remember mechanics, shared with AttachmentPreviewDialog.
   */
  const { panelStyle, resizeHandles } = useResizablePanel({
    panelRef,
    storageKey: SIZE_KEY,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    viewportMargin: VIEWPORT_MARGIN,
  })

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    },
    [],
  )

  const requestClose = () => {
    if (closingRef.current) {
      return
    }
    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(onClose, EXIT_MS)
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      // A preview or confirmation dialog opened on top of this one should handle
      // its own Escape first, instead of both closing at once.
      if (document.querySelectorAll('[role="dialog"]').length > 1) {
        return
      }
      requestClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!task) {
    return null
  }

  const parentFolder = getFolder(task.folderId)
  if (!parentFolder) {
    return null
  }
  const folderPath = getPath(parentFolder.id)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
      /*
       * Portalled straight to <body> — every other overlay in this app already does this
       * (MoveTaskDialog, DuplicateTaskDialog, ShareDialog); this was the one exception, rendered
       * inline in whichever page opened it instead. `position: fixed` is supposed to mean
       * "relative to the viewport" regardless of DOM nesting, but that guarantee breaks the
       * instant an ancestor sets a transform, filter, perspective or will-change — and Tasks and
       * Important both wrap their page content in exactly that kind of animated wrapper for their
       * page-transition slide (see usePageEnter). The dialog was inheriting that wrapper's box as
       * its containing block instead of the true viewport, so on those two pages — and only those
       * two, since folder views carry no such wrapper — it opened centred against the content
       * column beside the sidebar rather than against the window.
       *
       * React still routes events through the *component* tree after a portal, not the DOM tree,
       * so a click inside this dialog would otherwise reach whatever opened it — see
       * MoveTaskDialog's own note on this for the fuller version. Stopped here, once, rather than
       * on every control inside.
       */
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Close"
        className={cn('absolute inset-0 bg-black/30', closing ? 'anim-overlay-out' : 'anim-overlay-in')}
        onClick={requestClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={task.title.trim() || 'Untitled task'}
        tabIndex={-1}
        /*
         * A dragged size, when there is one, beats every class below.
         *
         * Inline rather than a class because the value is a number that came from a pointer, and
         * inline is also what settles the fight with `sm:max-w-3xl` — which would otherwise cap a
         * deliberately widened dialog back to 768px and make the east grip stop responding halfway
         * through a drag. Withheld entirely below `sm`, where the class layout is a full screen
         * and a pixel width would be actively wrong.
         */
        style={panelStyle}
        className={cn(
          // Full screen on a phone (dvh, so the software keyboard shrinks it instead of pushing
          // the bottom bar off-screen), a centred panel from sm up. Either way the height is
          // definite, which is what lets the writing area be a fixed box that scrolls inside
          // itself while the header and the attachment bar stay put.
          'relative flex h-[100dvh] w-full flex-col overflow-hidden border-[var(--color-border)] bg-[var(--color-surface)] outline-none',
          'pt-[env(safe-area-inset-top)] sm:h-[min(88vh,860px)] sm:max-w-3xl sm:rounded-xl sm:border sm:pt-0 sm:shadow-[var(--shadow-lg)]',
          closing ? 'anim-dialog-out' : 'anim-dialog-in',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
          {/*
            * relative z-30: above the resize handles (z-20 — see useResizablePanel), which are
            * absolutely positioned and would otherwise win hit-testing wherever their invisible
            * corners geometrically overlap a real control. This row sits flush against the
            * panel's top edge, so its leftmost icon (Pin) shared pixels with the nw corner grip —
            * a click aimed at Pin landed on the grip instead and did nothing, on every page, since
            * every page opens this same dialog to edit a task.
            *
            * Scoped to the two control clusters rather than the header row as a whole: the row
            * spans the panel's full width and the resize strip along the top edge (`n`) sits
            * entirely inside the row's own height, so raising the *row* would have silently taken
            * the whole top edge away from resizing to fix a problem that only existed in its two
            * corners. These two `relative z-30` wrappers cover exactly the icons that sit inside
            * `nw` and `ne` and nothing either handle would otherwise still be reachable through.
            */}
          <div className="relative z-30 flex items-center gap-0.5">
            {/* Pins to whichever listing opened this dialog — see the `scope` prop — worded the
                same way the card's own "..." menu words it (SCOPE_LABELS), so a note pinned from
                here and one pinned from there read as the same action rather than two. */}
            <PinButton
              pinned={task.pinnedScopes.includes(scope)}
              onToggle={() => toggleTaskPinned(task.id, scope)}
              label={
                task.pinnedScopes.includes(scope)
                  ? `Unpin from ${SCOPE_LABELS[scope]}`
                  : `Pin to top of ${SCOPE_LABELS[scope]}`
              }
            />
            <StarButton important={task.isImportant} onToggle={() => toggleTaskImportant(task.id)} />
            <RowDeleteButton
              label={`Delete ${task.title.trim() || 'Untitled'}`}
              onClick={() => requestTaskDelete(task.id)}
            />
            {/* Save state belongs with the note's other top-level actions, not inline with the
                title where it competed with the metadata for the row. */}
            <SaveStatusLabel status={saveStatus} />
          </div>
          <IconButton label="Close" onClick={requestClose} className="relative z-30">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1">
          <TaskEditor task={task} folderPath={folderPath} showActions={false} fillWidth />
        </div>

        {/*
          * The grips, last so they paint over the editor's own edges.
          *
          * `aria-hidden`, and not focusable: this is a pointer affordance on a dialog that is
          * entirely usable at its default size, and the honest alternative — eight tab stops
          * between the header and the writing area — would cost every keyboard user something
          * real to give them something they cannot drag anyway.
          */}
        {resizeHandles}
      </div>
      {deleteDialog}
    </div>,
    document.body,
  )
}
