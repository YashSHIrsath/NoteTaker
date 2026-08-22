import { useState } from 'react'
import { CalendarClock, GripVertical } from 'lucide-react'
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
import { referencedAttachmentIds } from '../../lib/blockNoteContent'
import { useBlockHandles } from '../../hooks/useBlockHandles'

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
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const overdue = task.dueAt !== null && task.status !== 'complete' && isOverdue(task.dueAt)
  // Deleting an attachment's block from the text doesn't delete the underlying attachment
  // record, so this bar only lists ones still actually referenced somewhere in the document.
  const referencedIds = referencedAttachmentIds(task.content)
  const attachments = getAttachmentsForTask(task.id)
    .filter((attachment) => referencedIds.has(attachment.id))
    .sort((a, b) => attachmentSortRank(a) - attachmentSortRank(b))

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
          onChange={(title) => updateTaskTitle(task.id, title)}
        />

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDueDialogOpen(true)}
            className={cn(
              'anim-press inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
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

          {/* Gutter controls on/off. Off is the default: the "+" and drag handle need a 54px
              margin the text would rather have, and "/" does the same job inline. */}
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

      <div className="mt-1.5 shrink-0">
        <TaskTagInput tags={task.tags} onChange={(tags) => updateTaskTags(task.id, tags)} />
      </div>

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
            onContentChange={(content) => updateTaskContent(task.id, content)}
          />
        </div>
      </div>

      {attachments.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:px-6">
          {attachments.map((attachment) => (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setPreviewAttachment(attachment)}
              className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1.5 text-left text-[13px] font-medium text-[var(--color-text)] hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
            >
              <AttachmentTypeIcon attachment={attachment} />
              <span className="min-w-0 truncate">{attachment.name}</span>
            </button>
          ))}
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
