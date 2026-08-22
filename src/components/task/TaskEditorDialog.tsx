import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useFolders } from '../../hooks/useFolders'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { IconButton } from '../ui/IconButton'
import { cn } from '../../lib/cn'
import { PinButton } from '../common/PinButton'
import { StarButton } from '../common/StarButton'
import { RowDeleteButton } from '../common/RowDeleteButton'
import { SaveStatusLabel } from './SaveStatusLabel'
import { TaskEditor } from './TaskEditor'

export interface TaskEditorDialogProps {
  taskId: string
  onClose: () => void
}

/** Kept in step with the .anim-dialog-out / .anim-overlay-out duration in index.css. */
const EXIT_MS = 120

export function TaskEditorDialog({ taskId, onClose }: TaskEditorDialogProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
        className={cn(
          // Height follows the note: a two-line note gets a short dialog, a long one grows until
          // it hits the viewport cap and then scrolls. A fixed height meant every short note
          // opened as a mostly-empty full-height sheet.
          //
          // The panel itself is the scroll container. Handing that job to a nested flex child
          // instead is what broke scrolling in a long note: with the panel's height driven by its
          // content, the inner box's `height: 100%` / flex basis resolved against the *unclamped*
          // content height, so it never shrank, never scrolled, and the overflow was simply
          // clipped — reachable only by moving the caret with the arrow keys.
          'relative flex max-h-[min(88vh,860px)] min-h-[220px] w-full max-w-3xl flex-col overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none',
          closing ? 'anim-dialog-out' : 'anim-dialog-in',
        )}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            <PinButton pinned={task.isPinned} onToggle={() => toggleTaskPinned(task.id)} />
            <StarButton important={task.isImportant} onToggle={() => toggleTaskImportant(task.id)} />
            <RowDeleteButton
              label={`Delete ${task.title.trim() || 'Untitled'}`}
              onClick={() => requestTaskDelete(task.id)}
            />
            {/* Save state belongs with the note's other top-level actions, not inline with the
                title where it competed with the metadata for the row. */}
            <SaveStatusLabel status={saveStatus} />
          </div>
          <IconButton label="Close" onClick={requestClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        {/* No height games here: the note is laid out at its natural height and the panel above
            scrolls it. flex-auto so it still fills the panel's minimum height when the note is
            short. */}
        <div className="flex-auto">
          <TaskEditor task={task} folderPath={folderPath} showActions={false} />
        </div>
      </div>
      {deleteDialog}
    </div>
  )
}
