import { useState } from 'react'
import { ChevronDown, ChevronUp, Check, GripVertical, Pencil } from 'lucide-react'
import type { Attachment, Folder, Task } from '../../types'
import { FolderBreadcrumb } from '../folder/FolderBreadcrumb'
import { TaskBlockNoteEditor } from './TaskBlockNoteEditor'
import { TaskTitleEditor } from './TaskTitleEditor'
import { SaveStatusLabel } from './SaveStatusLabel'
import { TaskStatusBadge, ReminderCountPill } from './TaskStatusBadge'
import { TaskActionsMenu } from './TaskActionsMenu'
import { TaskCountdown } from './TaskCountdown'
import { TaskTagInput } from './TaskTagInput'
import { AttachmentPreviewDialog } from '../attachment/AttachmentPreviewDialog'
import { AttachmentTypeIcon, attachmentSortRank } from '../attachment/AttachmentTypeIcon'
import { useFolders } from '../../hooks/useFolders'
import { useTaskCompletion } from '../../hooks/useTaskCompletion'
import { cn } from '../../lib/cn'
import { taskLifecycle } from '../../lib/taskLifecycle'
import { scheduledReminders } from '../../lib/reminders'
import { useServerNow } from '../../hooks/useServerNow'
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
    updateTaskTitle,
    updateTaskContent,
    getRemindersForTask,
    updateTaskTags,
    getAttachmentsForTask,
    saveStatus,
  } = useFolders()
  const { toggleCompleted, dialog: reopenDialog } = useTaskCompletion()
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

  const isTracked = task.noteKind === 'due_task' && task.dueAt !== null
  const now = useServerNow(isTracked && !task.completed)
  const lifecycle = taskLifecycle(task, now)
  const reminderCount = scheduledReminders(getRemindersForTask(task.id)).length
  // Every file attached to the note. Not filtered by what the text still references: documents
  // aren't inserted into the text any more (they live here), so that filter would hide the very
  // files this bar exists for.
  const attachments = getAttachmentsForTask(task.id).sort(
    (a, b) => attachmentSortRank(a) - attachmentSortRank(b),
  )
  const hasImage = attachments.some((attachment) => attachment.isImage)

  /**
   * The two toggles that only make sense inside an open note, as menu rows.
   *
   * Each is conditional for the same reason it always was: there is nothing to collapse without a
   * picture, and nothing for a drag handle to do while reading.
   */
  const viewToggles = [
    ...(hasImage
      ? [
          {
            key: 'images',
            label: imagesCollapsed ? 'Show images' : 'Collapse images',
            icon: imagesCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ),
            onSelect: toggleImages,
          },
        ]
      : []),
    ...(editing
      ? [
          {
            key: 'handles',
            label: blockHandles ? 'Hide block handles' : 'Show block handles',
            icon: <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />,
            onSelect: toggleBlockHandles,
          },
        ]
      : []),
  ]

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

          {/*
            * One thing about the deadline, not two.
            *
            * The badge and the countdown were both here, and on a finished task they said the same
            * sentence twice — a tick in a circle beside "✓ Completed on time", two checkmarks and
            * one fact. So a completed task shows the badge alone, which already carries that label
            * and is also the control that undoes it.
            *
            * While it is still open they are genuinely different questions: the circle is "mark
            * this done", the countdown is "how long is left". Both earn their place then.
            */}
          {isTracked && task.completed ? (
            <TaskStatusBadge
              lifecycle={lifecycle}
              completed
              compact
              onToggle={() => toggleCompleted(task.id)}
            />
          ) : isTracked ? (
            <>
              <TaskStatusBadge
                lifecycle={lifecycle}
                completed={false}
                iconOnly
                onToggle={() => toggleCompleted(task.id)}
              />
              <TaskCountdown task={task} compact />
            </>
          ) : null}

          <ReminderCountPill count={reminderCount} compact />

          {showActions ? <SaveStatusLabel status={saveStatus} /> : null}

          {/* An open note is not one of the three listings, so its pin acts on the folder the note
              lives in — the listing it is unambiguously part of. */}
          <TaskActionsMenu task={task} scope="folder" compact extraItems={viewToggles} />
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

      {reopenDialog}
    </div>
  )
}
