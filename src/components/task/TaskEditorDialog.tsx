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
          // A definite height, so the note's own writing area can be a fixed box that scrolls
          // inside itself: 70% of the viewport on a phone, and up to 860px on a desktop. The
          // panel no longer scrolls — its header is fixed and the writing area owns the overflow,
          // which is what keeps the title and the toolbar in place while a long note scrolls.
          'relative flex h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none sm:h-[min(88vh,860px)]',
          closing ? 'anim-dialog-out' : 'anim-dialog-in',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
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
        <div className="min-h-0 flex-1">
          <TaskEditor task={task} folderPath={folderPath} showActions={false} />
        </div>
      </div>
      {deleteDialog}
    </div>
  )
}
