import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFolders } from '../../hooks/useFolders'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { useMediaQuery } from '../../hooks/useMediaQuery'
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

interface PanelSize {
  width: number
  height: number
}

/**
 * Never bigger than the window currently allows, never smaller than usable.
 *
 * The upper bound is itself floored at the minimum, so a window narrower than MIN_WIDTH gives an
 * inverted range rather than a negative one — clamping to nonsense beats clamping to a negative
 * width, which is a runtime error in CSS terms.
 */
function clampSize(size: PanelSize): PanelSize {
  return {
    width: Math.min(
      Math.max(size.width, MIN_WIDTH),
      Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN),
    ),
    height: Math.min(
      Math.max(size.height, MIN_HEIGHT),
      Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN),
    ),
  }
}

/**
 * The size this device last dragged the dialog to, if it is still usable here.
 *
 * Remembered because the alternative is resizing it again for every note you open, which turns a
 * feature into a chore and then into one nobody uses. Per device rather than per account: how big
 * a window should be is a property of the screen in front of you, not of the notes in it.
 *
 * Clamped on the way in as well as on the way out — the size may have been written down on a
 * larger monitor than the one reading it back.
 */
function readStoredSize(): PanelSize | null {
  try {
    const raw = window.localStorage.getItem(SIZE_KEY)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }
    const { width, height } = parsed as Partial<PanelSize>
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return null
    }
    return clampSize({ width: width as number, height: height as number })
  } catch {
    // Unparseable, or unreadable at all — a browser set to block site data throws on the read.
    // The CSS default is a perfectly good answer, so there is nothing here worth recovering.
    return null
  }
}

/**
 * The eight grips, and what each one does to the panel.
 *
 * `x` and `y` are the sign a pointer movement is applied with, which is the whole difference
 * between the edges: west and north run backwards, the four corners drive both axes at once, and
 * a zero means that axis is left alone. The edges are inset from the corners so the two never
 * overlap and the corner always wins where they meet.
 */
const RESIZE_HANDLES = [
  { edge: 'n', x: 0, y: -1, className: 'inset-x-4 top-0 h-1.5 cursor-ns-resize' },
  { edge: 's', x: 0, y: 1, className: 'inset-x-4 bottom-0 h-1.5 cursor-ns-resize' },
  { edge: 'w', x: -1, y: 0, className: 'inset-y-4 left-0 w-1.5 cursor-ew-resize' },
  { edge: 'e', x: 1, y: 0, className: 'inset-y-4 right-0 w-1.5 cursor-ew-resize' },
  { edge: 'nw', x: -1, y: -1, className: 'left-0 top-0 h-4 w-4 cursor-nwse-resize' },
  { edge: 'ne', x: 1, y: -1, className: 'right-0 top-0 h-4 w-4 cursor-nesw-resize' },
  { edge: 'sw', x: -1, y: 1, className: 'bottom-0 left-0 h-4 w-4 cursor-nesw-resize' },
  { edge: 'se', x: 1, y: 1, className: 'bottom-0 right-0 h-4 w-4 cursor-nwse-resize' },
] as const

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
   * The handles are not merely hidden there, they are not mounted.
   */
  const resizable = useMediaQuery('(min-width: 640px)')
  const [size, setSize] = useState<PanelSize | null>(readStoredSize)
  /*
   * The current size, readable from a handler that closed over an older one.
   *
   * `endResize` is registered once per render but runs at the end of a drag that has moved the
   * size many times since — reading `size` there would write down whatever it was when the drag
   * *started*, which is the one value nobody wants remembered.
   */
  const sizeRef = useRef(size)
  const dragRef = useRef<
    { x: number; y: number; startX: number; startY: number; width: number; height: number } | null
  >(null)

  useEffect(() => {
    sizeRef.current = size
  }, [size])

  // A window dragged smaller has to take the panel with it. Without this a dialog sized on an
  // external monitor comes back on the laptop wider than the screen it is centred in, with its
  // close button off both edges.
  useEffect(() => {
    const onWindowResize = () => {
      setSize((current) => {
        if (!current) {
          return current
        }
        const next = clampSize(current)
        // Same object when nothing changed: this fires continuously while a window is dragged,
        // and a new object every time would re-render the editor for each pixel.
        return next.width === current.width && next.height === current.height ? current : next
      })
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [])

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

  const beginResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    handle: (typeof RESIZE_HANDLES)[number],
  ) => {
    const panel = panelRef.current
    if (!panel) {
      return
    }
    // Measured, not read from state. The first drag of all starts from whatever the CSS default
    // worked out to on this screen, and there is no number for that until the panel is on it.
    const rect = panel.getBoundingClientRect()
    dragRef.current = {
      x: handle.x,
      y: handle.y,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
    }
    // Capture, so a fast drag that outruns the 6px strip keeps resizing instead of stopping dead
    // the moment the pointer leaves it.
    event.currentTarget.setPointerCapture(event.pointerId)
    // Stops the drag turning into a text selection across the note behind the grip.
    event.preventDefault()
  }

  const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    /*
     * Twice the distance dragged, because the panel is centred.
     *
     * Its layout keeps it in the middle of the viewport whatever size it is, so widening it by
     * 10px moves each edge out by 5 — and a grip travelling at half the speed of the pointer feels
     * broken long before you work out why. Doubling puts the edge back under the pointer, and has
     * the happy consequence that opposite edges behave identically instead of one of them being
     * the "real" one.
     */
    setSize(
      clampSize({
        width: drag.width + drag.x * (event.clientX - drag.startX) * 2,
        height: drag.height + drag.y * (event.clientY - drag.startY) * 2,
      }),
    )
  }

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return
    }
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    try {
      window.localStorage.setItem(SIZE_KEY, JSON.stringify(sizeRef.current))
    } catch {
      // Storage full, or blocked outright. The size still applies for as long as this tab is
      // open, which is the part that was actually asked for; only the memory of it is lost.
    }
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
        style={
          resizable && size
            ? { width: `${size.width}px`, height: `${size.height}px`, maxWidth: 'none' }
            : undefined
        }
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
            * relative z-30: above the resize handles (z-20 — see RESIZE_HANDLES below), which are
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
        {resizable
          ? RESIZE_HANDLES.map((handle) => (
              <div
                key={handle.edge}
                aria-hidden
                onPointerDown={(event) => beginResize(event, handle)}
                onPointerMove={onResizeMove}
                onPointerUp={endResize}
                onPointerCancel={endResize}
                className={cn('absolute z-20 touch-none select-none', handle.className)}
              >
                {/*
                  * One visible corner, on the one people look for.
                  *
                  * A resize nobody can see is a resize nobody finds — the other seven grips are
                  * discovered from the cursor once you know the dialog resizes at all, and this is
                  * what says that. Inset 8px so the panel's own 12px corner radius doesn't clip it.
                  */}
                {handle.edge === 'se' ? (
                  <span className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 rounded-br-[3px] border-b-2 border-r-2 border-[var(--color-border-strong)] opacity-70" />
                ) : null}
              </div>
            ))
          : null}
      </div>
      {deleteDialog}
    </div>,
    document.body,
  )
}
