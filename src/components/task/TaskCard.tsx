import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { CalendarClock, FileText, FolderInput, Pin } from 'lucide-react'
import type { Attachment } from '../../types'
import { cn } from '../../lib/cn'
import { formatDueDate } from '../../lib/dueDate'
import { taskLifecycle, lifecycleStyle } from '../../lib/taskLifecycle'
import { nextReminderAt } from '../../lib/reminders'
import { countdownLabel } from '../../lib/countdown'
import { useServerNow } from '../../hooks/useServerNow'
import { useFolders } from '../../hooks/useFolders'
import { StarButton } from '../common/StarButton'
import { PinButton } from '../common/PinButton'
import { RowDeleteButton } from '../common/RowDeleteButton'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { useTaskCompletion } from '../../hooks/useTaskCompletion'
import type { FolderCategory } from '../../lib/folderColor'
import { taskColorStyle } from '../../lib/taskColor'
import { findBlockAttachmentId, referencedAttachmentIds } from '../../lib/blockNoteContent'
import { AttachmentPreviewDialog } from '../attachment/AttachmentPreviewDialog'
import { AttachmentTypeIcon, attachmentSortRank } from '../attachment/AttachmentTypeIcon'
import { TaskContentPreview } from './TaskContentPreview'
import { TaskTagsPill } from './TaskTagsPill'
import { TaskStatusBadge, ReminderCountPill } from './TaskStatusBadge'
import { TaskCountdown } from './TaskCountdown'
import { MoveTaskDialog } from './MoveTaskDialog'
import { TaskScheduleDialog } from './TaskScheduleDialog'

/** Chips that fit a card's width; the rest become a "+N" counter rather than being clipped. */
const ATTACHMENT_CHIP_LIMIT = 2

export interface TaskCardProps {
  taskId: string
  title: string
  category?: FolderCategory
  onOpen: () => void
  /** Shown as "in {folderLabel}" under the title — for views that mix tasks from multiple folders. */
  folderLabel?: string
  /** Solid pastel card per category — a distinct sticky-note look for a dedicated tasks view, not the app's default neutral card. */
  colorful?: boolean
}

export function TaskCard({
  taskId,
  title,
  category = 'indigo',
  onOpen,
  folderLabel,
  colorful = false,
}: TaskCardProps) {
  const {
    getTask,
    toggleTaskImportant,
    toggleTaskPinned,
    getRemindersForTask,
    getAttachmentsForTask,
  } = useFolders()
  const { requestTaskDelete, dialog } = useDeleteTask()
  const { toggleCompleted, dialog: reopenDialog } = useTaskCompletion()
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const task = getTask(taskId)
  const folderId = task?.folderId ?? null
  const isTracked = task?.noteKind === 'due_task' && task.dueAt !== null
  const now = useServerNow(isTracked && !task?.completed)
  const lifecycle = task ? taskLifecycle(task, now) : 'note'
  const taskReminders = getRemindersForTask(taskId)
  const reminderCount = taskReminders.filter((reminder) => reminder.isActive).length
  // The clock button says when the next email actually goes out, not just that reminders exist.
  const nextReminder = nextReminderAt(taskReminders)
  const scheduleHint = nextReminder
    ? `Next reminder ${countdownLabel(new Date(nextReminder).getTime(), now).replace(' remaining', '')}`
    : isTracked
      ? 'Due date & reminders'
      : 'Add due date or reminder'
  /**
   * A due-date task's colour is its status, and it is not up for negotiation.
   *
   * A plain note keeps the full picker (an explicit choice, else the folder's colour). A task
   * overrides both: green for done on time, red for overdue, amber for done late, neutral until
   * then. Letting the palette win here would mean an overdue task could be mint green, at which
   * point the colour stops carrying any information at all.
   */
  const statusColors = lifecycleStyle(lifecycle)
  const colors = statusColors ?? taskColorStyle(task?.color ?? null, category)
  const important = task?.isImportant ?? false
  const pinned = task?.isPinned ?? false
  // Pinned already has its own strong accent treatment — colorful only takes over the plain case.
  // A due-date task ignores both: its status colour is a readout, so it paints in every view style
  // rather than only in the colourful one. It outranks the pinned accent too: `pinned` stays true
  // so the button and the pin icon still reflect it, but the card paints its state.
  const pinnedAccent = pinned && statusColors === null
  const showColor = statusColors !== null || (colorful && !pinned)
  // Deleting an attachment's block from the text doesn't delete the underlying attachment
  // record, so this bar only lists ones still actually referenced somewhere in the document.
  const referencedIds = task ? referencedAttachmentIds(task.content) : new Set<string>()
  const attachments = getAttachmentsForTask(taskId)
    .filter((attachment) => referencedIds.has(attachment.id))
    .sort((a, b) => attachmentSortRank(a) - attachmentSortRank(b))
  const hasImageAttachment = attachments.some((attachment) => attachment.isImage)
  const shownAttachments = attachments.slice(0, ATTACHMENT_CHIP_LIMIT)
  const hiddenAttachmentCount = attachments.length - shownAttachments.length

  // Attachment boxes stay clickable even though the rest of the preview is inert (see the
  // pointer-events CSS), so a click there opens its own preview instead of the whole task.
  const handleAttachmentClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!task) {
      return
    }
    const target = event.target as HTMLElement
    const blockContent = target.closest<HTMLElement>('[data-content-type="image"], [data-content-type="file"]')
    if (!blockContent) {
      return
    }
    const blockOuter = blockContent.closest<HTMLElement>('[data-id]')
    const blockId = blockOuter?.getAttribute('data-id')
    if (!blockId) {
      return
    }
    const attachmentId = findBlockAttachmentId(task.content, blockId)
    if (!attachmentId) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const attachment = getAttachmentsForTask(taskId).find((item) => item.id === attachmentId)
    if (attachment) {
      setPreviewAttachment(attachment)
    }
  }

  useLayoutEffect(() => {
    const node = bodyRef.current
    if (!node) {
      return
    }
    setIsOverflowing(node.scrollHeight > node.clientHeight + 1)
  }, [task?.content])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      // A card that arrives — created, or re-mounted into another section/column by pinning —
      // fades up into place instead of appearing from nowhere.
      className="anim-item-in h-full rounded-2xl"
      data-task-id={taskId}
    >
      <div
        className={cn(
          // Fills the grid cell rather than setting its own height: the canvas owns the size now,
          // and a fixed height would let a resize move the cell's edges without the card following.
          'relative flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border transition-all duration-200 ease-out',
          pinnedAccent
            ? 'border-[var(--color-accent)]/70 bg-[var(--color-accent-soft-hover)] shadow-[0_0_0_1px_rgba(139,133,240,0.14),0_16px_30px_rgba(0,0,0,0.14)] hover:shadow-[0_0_0_1px_rgba(139,133,240,0.18),0_20px_34px_rgba(0,0,0,0.18)]'
            : showColor
              ? 'border-white/10 shadow-[0_12px_28px_rgba(0,0,0,0.18)] hover:shadow-[0_16px_32px_rgba(0,0,0,0.2)]'
              : 'border-[var(--color-border-strong)]/80 bg-[var(--color-surface-raised)] shadow-[0_0_0_1px_rgba(82,88,100,0.08),0_12px_26px_rgba(0,0,0,0.12)] hover:shadow-[0_0_0_1px_rgba(82,88,100,0.12),0_16px_30px_rgba(0,0,0,0.16)]',
        )}
        style={showColor ? { background: colors.card } : undefined}
      >
        {pinned ? (
          <svg
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-[var(--color-accent)] opacity-[0.08]"
            viewBox="0 0 400 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d="M0,60 C60,20 120,90 180,55 C240,20 300,85 360,45 C380,35 390,40 400,50 L400,100 L0,100 Z"
              fill="currentColor"
            />
          </svg>
        ) : null}

        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={handleKeyDown}
          className="relative flex flex-1 flex-col gap-2 rounded-t-2xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20 focus-visible:ring-inset sm:gap-2.5 sm:p-3.5"
        >
          <div className="flex h-7 shrink-0 items-center gap-2">
            {!hasImageAttachment ? (
              <span
                className={cn(
                  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  pinnedAccent || showColor ? '' : 'text-[var(--color-text-muted)]',
                )}
                style={pinnedAccent || showColor ? { background: colors.solid } : undefined}
                aria-hidden
              >
                <FileText
                  className="h-3.5 w-3.5"
                  style={pinnedAccent || showColor ? { color: 'white' } : undefined}
                  aria-hidden
                />
              </span>
            ) : null}
            {/* One line, truncated, on a fixed-height row — same reasoning as the tiles: a
              *  wrapping title made this row taller than the chips beside it and pushed everything
              *  below it out of step with the next card. */}
            <h3
              className="min-w-0 flex-1 truncate text-[14px] font-bold leading-snug tracking-[-0.01em]"
              style={{
                color: pinnedAccent ? 'var(--color-accent)' : showColor ? colors.ink : 'var(--color-text)',
              }}
              title={title}
            >
              {title}
            </h3>
            {pinned ? (
              <Pin
                className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--color-accent)]"
                aria-label="Pinned"
              />
            ) : null}
            {/* Tags as a count that opens on click, exactly as on a tile — a wrapped row of chips
              *  was the other thing making these cards different heights. */}
            {task && task.tags.length > 0 ? (
              <TaskTagsPill
                tags={task.tags}
                ink={showColor ? colors.ink : 'var(--color-text-muted)'}
              />
            ) : null}
          </div>

          {folderLabel ? (
            <p className="-mt-1.5 truncate text-[11.5px] text-[var(--color-text-muted)]">in {folderLabel}</p>
          ) : null}

          <div
            ref={bodyRef}
            onClick={handleAttachmentClick}
            className="relative max-h-52 overflow-hidden pointer-events-none sm:max-h-[280px]"
          >
            {task ? <TaskContentPreview taskId={taskId} content={task.content} /> : null}

            {isOverflowing ? (
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-0 flex h-9 items-end justify-center pb-0.5 text-[13px] font-semibold leading-none text-[var(--color-text-muted)]',
                  !showColor && 'bg-gradient-to-t to-transparent',
                  pinnedAccent ? 'from-[var(--color-accent-soft-hover)]' : !showColor ? 'from-[var(--color-surface-raised)]' : '',
                )}
                style={
                  showColor
                    ? { backgroundImage: `linear-gradient(to top, ${colors.card}, transparent)` }
                    : undefined
                }
              >
                &hellip;
              </div>
            ) : null}
          </div>
        </div>

        {attachments.length > 0 ? (
          <div
            className={cn(
              // One row, never wrapping and never scrolling: wrapping made every card a
              // different height, and a scroller left a chip visibly sliced off at the card edge.
              // What doesn't fit is counted instead (see ATTACHMENT_CHIP_LIMIT).
              'flex items-center gap-1.5 border-t px-3 py-1.5 sm:py-2',
              pinnedAccent ? 'border-[var(--color-accent)]/25' : !showColor && 'border-[var(--color-border)]',
            )}
            style={
              showColor
                ? { borderColor: `color-mix(in srgb, ${colors.ink} 25%, transparent)` }
                : undefined
            }
          >
            {shownAttachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setPreviewAttachment(attachment)
                }}
                className="anim-press flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-left text-[12px] font-medium text-[var(--color-text)] hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
              >
                <AttachmentTypeIcon attachment={attachment} />
                <span className="min-w-0 truncate">{attachment.name}</span>
              </button>
            ))}
            {hiddenAttachmentCount > 0 ? (
              <span className="shrink-0 rounded-full bg-[var(--color-hover)] px-2 py-1 text-[11.5px] font-semibold text-[var(--color-text-muted)]">
                +{hiddenAttachmentCount}
              </span>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            'flex items-center justify-between gap-1 border-t px-2 py-1',
            pinnedAccent ? 'border-[var(--color-accent)]/25' : !showColor && 'border-[var(--color-border)]',
          )}
          style={
            showColor
              ? { borderColor: `color-mix(in srgb, ${colors.ink} 25%, transparent)` }
              : undefined
          }
        >
          {task && isTracked && task.dueAt ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              {/* Symbol only, not "Overdue": the card has a fixed width, and the label plus a due
                *  date plus three action buttons could not all fit — the label ran out over the
                *  buttons. The tooltip and aria-label still name the state. */}
              <span className="shrink-0">
                <TaskStatusBadge
                  lifecycle={lifecycle}
                  completed={task.completed}
                  iconOnly
                  onToggle={() => toggleCompleted(taskId)}
                />
              </span>
              {/* The countdown replaces the bare date once the deadline is close enough to matter
                *  — "43m remaining" answers the question the date was only implying. It falls back
                *  to the date itself while there is more than a day to go. */}
              {/* The live figure, always — "2d 4h remaining" is what someone is actually asking
                *  when they glance at a deadline, and the date alone made them work it out. */}
              <span className="min-w-0 flex-1 truncate" title={formatDueDate(task.dueAt)}>
                <TaskCountdown task={task} compact />
              </span>
              <ReminderCountPill count={reminderCount} compact />
            </div>
          ) : reminderCount > 0 ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <ReminderCountPill count={reminderCount} compact />
            </div>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Dragging a card now places it on the canvas, so this is how a note changes folder. */}
            {folderId ? (
              <button
                type="button"
                aria-label={`Move ${title} to another folder`}
                title="Move to folder"
                onClick={(event) => {
                  event.stopPropagation()
                  setMoveOpen(true)
                }}
                className="anim-press inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
              >
                <FolderInput className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
            {/* Deadlines and reminders without opening the note. This is the only way to turn a
              *  note into a due-date task from a listing, and it is where people actually are —
              *  burying it inside the editor meant opening a note to say when it was due. */}
            <button
              type="button"
              aria-label={
                isTracked ? `Edit schedule for ${title}` : `Add a due date or reminder to ${title}`
              }
              title={scheduleHint}
              onClick={(event) => {
                event.stopPropagation()
                setScheduleOpen(true)
              }}
              className={cn(
                'anim-press inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
                isTracked || reminderCount > 0
                  ? 'text-[var(--color-accent)] hover:bg-[var(--color-hover)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            </button>
            <PinButton pinned={pinned} compact onToggle={() => toggleTaskPinned(taskId)} />
            <StarButton important={important} compact onToggle={() => toggleTaskImportant(taskId)} />
            <RowDeleteButton compact label={`Delete ${title}`} onClick={() => requestTaskDelete(taskId)} />
          </div>
        </div>
      </div>

      <MoveTaskDialog open={moveOpen} taskId={taskId} onClose={() => setMoveOpen(false)} />
      {task ? (
        <TaskScheduleDialog open={scheduleOpen} task={task} onClose={() => setScheduleOpen(false)} />
      ) : null}
      {dialog}
      {reopenDialog}
      <AttachmentPreviewDialog attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </div>
  )
}
