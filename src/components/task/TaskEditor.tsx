import { useState } from 'react'
import { CalendarClock, ChevronDown, ChevronUp, Check, GripVertical, Pencil } from 'lucide-react'
import type { Attachment, Folder, Task } from '../../types'
import { FolderBreadcrumb } from '../folder/FolderBreadcrumb'
import { TaskBlockNoteEditor } from './TaskBlockNoteEditor'
import { TaskTitleEditor } from './TaskTitleEditor'
import { SaveStatusLabel } from './SaveStatusLabel'
import { TaskDueDateDialog } from './TaskDueDateDialog'
import { TaskStatusBadge } from './TaskStatusBadge'
import { TaskTagInput } from './TaskTagInput'
import { AttachmentPreviewDialog } from '../attachment/AttachmentPreviewDialog'
import { AttachmentTypeIcon, attachmentSortRank } from '../attachment/AttachmentTypeIcon'
import { useFolders } from '../../hooks/useFolders'
import { useAuth } from '../../hooks/useAuth'
import { StarButton } from '../common/StarButton'
import { PinButton } from '../common/PinButton'
import { RowDeleteButton } from '../common/RowDeleteButton'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { cn } from '../../lib/cn'
import { formatDueDate, isOverdue } from '../../lib/dueDate'
import { nextTaskStatus } from '../../lib/taskStatus'
import { useBlockHandles, useCollapseImages } from '../../hooks/useBlockHandles'
import { isEmptyDocument } from '../../lib/blockNoteContent'

export interface TaskEditorProps {
  task: Task
  folderPath: Folder[]
  /** The popup dialog renders pin/star/delete in its own header instead, next to Close. */
  showActions?: boolean
}

export function TaskEditor({ task, folderPath, showActions = true }: TaskEditorProps) {
  const {
    toggleTaskImportant,
    toggleTaskPinned,
    updateTaskTitle,
    updateTaskContent,
    updateTaskReminder,
    updateTaskStatus,
    updateTaskTags,
    getAttachmentsForTask,
    saveStatus,
  } = useFolders()
  const { requestTaskDelete, dialog: taskDeleteDialog } = useDeleteTask()
  const { updateProfile } = useAuth()
  const [dueDialogOpen, setDueDialogOpen] = useState(false)
  const { enabled: blockHandles, toggle: toggleBlockHandles } = useBlockHandles()
  const { collapsed: imagesCollapsed, toggle: toggleImages } = useCollapseImages()
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)

  /**
   * Opening a note shows it; editing it is a thing you ask for.
   *
   * Except when there is nothing to show. A note you just created has no content to read, so
   * landing in reading mode would mean every new note starts with a button press before you can
   * type — the state is seeded from the note's own emptiness instead.
   *
   * `task.content` is read only when the note changes, not on every render: the moment you type,
   * the content stops being empty, and re-deriving from it would throw you out of the editor
   * mid-sentence. Resetting during render rather than in an effect is React's own pattern for
   * state that follows a prop — it re-renders before anything is painted, where an effect would
   * show one frame of the previous note's mode.
   */
  const [openedTaskId, setOpenedTaskId] = useState(task.id)
  const [editing, setEditing] = useState(() => isEmptyDocument(task.content))
  if (openedTaskId !== task.id) {
    setOpenedTaskId(task.id)
    setEditing(isEmptyDocument(task.content))
  }

  const overdue = task.dueAt !== null && task.status !== 'complete' && isOverdue(task.dueAt)
  // Every file attached to the note. Not filtered by what the text still references: documents
  // aren't inserted into the text any more (they live here), so that filter would hide the very
  // files this bar exists for.
  const attachments = getAttachmentsForTask(task.id).sort(
    (a, b) => attachmentSortRank(a) - attachmentSortRank(b),
  )
  const hasImage = attachments.some((attachment) => attachment.isImage)

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col">
      {/* Header block: fixed, never scrolls — the note's own box below owns the overflow. */}
      <div className="shrink-0 px-4 pt-2.5 sm:px-6 sm:pt-3">
      <FolderBreadcrumb path={folderPath} currentLabel={task.title.trim() || 'Untitled'} currentIsTask />

      {/* Title and every piece of metadata share one row: three stacked rows of chrome ate the
          space the note itself should have. The title takes what's left after the controls, which
          are all compact and shrink-0; the row wraps only when a screen genuinely can't fit it,
          rather than being pre-split into rows that are half empty on a wide dialog. */}
      <div className="mt-1.5 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <TaskTitleEditor
          id={`task-title-${task.id}`}
          value={task.title}
          readOnly={!editing}
          onChange={(title) => updateTaskTitle(task.id, title)}
        />

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {/* The note's mode, and the first control in the row because it decides what the rest
              of them are for. Reading is the resting state, so this reads "Edit" almost always;
              "Done" only while you are actually in the note changing it.

              Built as one of this row's chips rather than as a Button: everything alongside it is
              a 20px pill at 10px type, and a `size="sm"` Button is 28px at 12px — next to the due
              date it read as a different class of control that had wandered in. It carries the
              accent instead of the height, which is what makes it the one you reach for without
              making it the tallest thing in the row. */}
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing((current) => !current)}
            className={cn(
              'anim-press inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
              editing
                ? 'border-transparent bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
                : 'border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft-hover)]',
            )}
          >
            {editing ? (
              <Check className="h-2.5 w-2.5 shrink-0" aria-hidden />
            ) : (
              <Pencil className="h-2.5 w-2.5 shrink-0" aria-hidden />
            )}
            {editing ? 'Done' : 'Edit'}
          </button>

          <button
            type="button"
            onClick={() => setDueDialogOpen(true)}
            className={cn(
              'anim-press inline-flex h-5 min-w-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
              task.dueAt
                ? overdue
                  ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/15'
                  : 'border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft-hover)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
            )}
          >
            <CalendarClock className="h-2.5 w-2.5 shrink-0" aria-hidden />
            <span className="truncate">
              {task.dueAt
                ? overdue
                  ? `Overdue · ${formatDueDate(task.dueAt)}`
                  : formatDueDate(task.dueAt)
                : 'Due date'}
            </span>
          </button>

          {/* Symbol only: the icon already says pending / ongoing / complete, and the word was the
              widest thing in the row. The label lives on as the tooltip and the accessible name. */}
          {task.dueAt && task.status ? (
            <TaskStatusBadge
              status={task.status}
              iconOnly
              onCycle={() => updateTaskStatus(task.id, nextTaskStatus(task.status!))}
            />
          ) : null}

          {/* Pictures shown or collapsed to their filename. Same chip shape as the controls
              beside it, and it only appears when the note actually has an image to collapse. */}
          {hasImage ? (
            <button
              type="button"
              aria-pressed={imagesCollapsed}
              onClick={toggleImages}
              title={imagesCollapsed ? 'Show images' : 'Collapse images'}
              aria-label={imagesCollapsed ? 'Show images' : 'Collapse images'}
              className={cn(
                'anim-press inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                imagesCollapsed
                  ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              )}
            >
              {imagesCollapsed ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronUp className="h-3 w-3" aria-hidden />
              )}
            </button>
          ) : null}

          {/* Gutter controls on/off. Off is the default: the "+" and drag handle need a 54px
              margin the text would rather have, and "/" does the same job inline. Hidden while
              reading, where there is nothing for a "+" or a drag handle to do. */}
          {editing ? (
          <button
            type="button"
            aria-pressed={blockHandles}
            onClick={toggleBlockHandles}
            title={blockHandles ? 'Hide block handles (use / instead)' : 'Show block handles'}
            aria-label={blockHandles ? 'Hide block handles' : 'Show block handles'}
            className={cn(
              'anim-press inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
              blockHandles
                ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
            )}
          >
            <GripVertical className="h-3 w-3" aria-hidden />
          </button>
          ) : null}

          {/* The full-page route has no dialog header to put these in; the dialog renders its own,
              alongside the save state. */}
          {showActions ? (
            <>
              <PinButton pinned={task.isPinned} compact onToggle={() => toggleTaskPinned(task.id)} />
              <StarButton important={task.isImportant} compact onToggle={() => toggleTaskImportant(task.id)} />
              <RowDeleteButton
                compact
                label={`Delete ${task.title.trim() || 'Untitled'}`}
                onClick={() => requestTaskDelete(task.id)}
              />
              <SaveStatusLabel status={saveStatus} />
            </>
          ) : null}
        </div>
      </div>

      {/* Reading an untagged note, this row is the "add a tag" button and nothing else — so it
          isn't there. */}
      {editing || task.tags.length > 0 ? (
        <div className="mt-1.5 shrink-0">
          <TaskTagInput
            tags={task.tags}
            readOnly={!editing}
            onChange={(tags) => updateTaskTags(task.id, tags)}
          />
        </div>
      ) : null}

      </div>

      {/* The writing area: a fixed box, bordered so it reads as its own surface separated from the
          title above it. Whatever is typed stays inside and scrolls here rather than growing the
          page, so the title, the metadata and the attachment bar never move. */}
      <div className="min-h-0 flex-1 px-4 pb-3 pt-2 sm:px-6">
        <div className="h-full overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-2">
          <TaskBlockNoteEditor
            key={task.id}
            taskId={task.id}
            content={task.content}
            showBlockHandles={blockHandles}
            collapseImages={imagesCollapsed}
            readOnly={!editing}
            onContentChange={(content) => updateTaskContent(task.id, content)}
          />
        </div>
      </div>

      {/* Every file on the note, in one bar pinned to the bottom: a single row that scrolls
          sideways, so a hundred files is still one bar rather than a wall of wrapped chips eating
          the writing area. shrink-0 keeps it out of the playground's scroll, and the safe-area
          padding keeps it clear of the gesture bar in the app. */}
      {attachments.length > 0 ? (
        <div className="shrink-0 border-t border-[var(--color-border)] pb-[env(safe-area-inset-bottom)]">
          <div className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-2.5 sm:px-6">
            {attachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                onClick={() => setPreviewAttachment(attachment)}
                className="anim-press flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-left text-[12.5px] font-medium text-[var(--color-text)] hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
              >
                <AttachmentTypeIcon attachment={attachment} />
                <span className="min-w-0 truncate">{attachment.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <AttachmentPreviewDialog attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />

      <TaskDueDateDialog
        open={dueDialogOpen}
        dueAt={task.dueAt}
        remindBeforeMinutes={task.remindBeforeMinutes}
        onClose={() => setDueDialogOpen(false)}
        onSave={(dueAt, remindBeforeMinutes) => {
          updateTaskReminder(task.id, dueAt, remindBeforeMinutes)
          // The reminder email is rendered server-side with no timezone context of its own,
          // so it needs to know yours — stamped fresh here rather than once at sign-in, since
          // that's cheap and covers you setting a due date after traveling to a new zone.
          if (dueAt) {
            void updateProfile({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => undefined)
          }
        }}
      />
      {showActions ? taskDeleteDialog : null}
    </div>
  )
}
