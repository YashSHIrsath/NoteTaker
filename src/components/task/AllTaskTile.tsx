import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { ChevronRight } from 'lucide-react'
import type { Attachment, TaskListScope } from '../../types'
import type { FolderCategory } from '../../lib/folderColor'
import { useAuth } from '../../hooks/useAuth'
import { TASK_TAPE_STYLE, taskColorStyle, taskPinStyle } from '../../lib/taskColor'
import { formatDueDate } from '../../lib/dueDate'
import { readTaskDecorations } from '../../lib/viewStyle'
import { lifecycleStyle, taskLifecycle } from '../../lib/taskLifecycle'
import { nextReminderAt, scheduledReminders } from '../../lib/reminders'
import { sendLabel } from '../../lib/countdown'
import { useServerNow } from '../../hooks/useServerNow'
import { findBlockAttachmentId, referencedAttachmentIds } from '../../lib/blockNoteContent'
import { isPinnedIn } from '../../lib/taskGrid'
import { useFolders } from '../../hooks/useFolders'
import { useTaskCompletion } from '../../hooks/useTaskCompletion'
import { AttachmentPreviewDialog } from '../attachment/AttachmentPreviewDialog'
import { TaskColorButton } from './TaskColorButton'
import { TaskCardControls } from './TaskCardControls'
import { TaskActionsMenu } from './TaskActionsMenu'
import { TaskTagsPill } from './TaskTagsPill'
import { AttachmentTypeIcon, attachmentSortRank } from '../attachment/AttachmentTypeIcon'
import { TaskContentPreview } from './TaskContentPreview'
import { TaskCountdown } from './TaskCountdown'
import { TaskStatusBadge, ReminderCountPill } from './TaskStatusBadge'
import { cn } from '../../lib/cn'

/**
 * Column count comes from the space actually available: auto-fill fits as many columns as the
 * minimum track allows, then 1fr shares the rest, so widths and gaps are always equal.
 *
 * The minimum steps up with the breakpoint because "comfortable" isn't one number. Phones get
 * 150px, which puts two tiles per row from ~350px up (a 350px viewport leaves 318px inside the
 * page's 16px gutters: two 154px tiles plus the 10px gap). From `sm` the minimum grows so a
 * tablet or desktop doesn't end up with seven skinny columns — 200px there, 220px from `lg`,
 * which lands on 3 columns beside the sidebar and 4 on a wide screen.
 *
 * The min() guard keeps a track from overflowing a container narrower than the minimum (a board
 * column, a split panel) instead of forcing a horizontal scrollbar.
 *
 * Shared by every tile grid (Tasks, Important, folder views) so they can't drift apart.
 */
export const TASK_TILE_GRID = [
  'mt-2 grid gap-2.5 sm:gap-3',
  'grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))]',
  'sm:grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))]',
  'lg:grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))]',
].join(' ')

export interface AllTaskTileProps {
  taskId: string
  /** The listing this tile is drawn in — pinning and grid placement are both per-listing. */
  scope: TaskListScope
  category: FolderCategory
  folderLabel?: string
  onOpen: () => void
}

/** A single-color sticky-note tile for the flat "all tasks" grid.
 *
 *  One fixed height for every tile — a portrait rectangle — so the grid stays even whatever a note
 *  contains. Fixed in pixels rather than as an aspect ratio on purpose: an aspect ratio ties height
 *  to column width, which is what turned these into tall empty squares on a wide screen. */
export function AllTaskTile({ taskId, scope, category, folderLabel, onOpen }: AllTaskTileProps) {
  const { getTask, getAttachmentsForTask, updateTaskColor, getRemindersForTask } = useFolders()
  const { toggleCompleted, dialog: reopenDialog } = useTaskCompletion()
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [attachmentsScrollable, setAttachmentsScrollable] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const attachmentsRef = useRef<HTMLDivElement>(null)

  const { user } = useAuth()
  const decorationsEnabled = readTaskDecorations(user?.user_metadata as Record<string, unknown> | undefined)
  const task = getTask(taskId)
  const pinned = task ? isPinnedIn(task, scope) : false
  // An explicit pick wins; without one the view's own rule (folder color, or the scatter in a
  // flat list) still decides, exactly as before the picker existed.
  const isTracked = task?.noteKind === 'due_task' && task.dueAt !== null
  const now = useServerNow(isTracked && !task?.completed)
  const lifecycle = task ? taskLifecycle(task, now) : 'note'
  const taskReminders = getRemindersForTask(taskId)
  const reminderCount = scheduledReminders(taskReminders).length
  // The clock button says when the next email actually goes out, not just that reminders exist.
  const nextReminder = nextReminderAt(taskReminders)
  const reminderHint = nextReminder
    ? sendLabel(new Date(nextReminder).getTime(), now).toLowerCase()
    : undefined
  // A due-date task's fill is its status and can't be overridden; a plain note keeps the picker.
  // Same rule as TaskCard, for the same reason: the colour is information here, not decoration.
  const statusColors = lifecycleStyle(lifecycle)
  const colors = statusColors ?? taskColorStyle(task?.color ?? null, category)
  const ink = colors.ink

  const referencedIds = task ? referencedAttachmentIds(task.content) : new Set<string>()
  const attachments = getAttachmentsForTask(taskId)
    .filter((attachment) => referencedIds.has(attachment.id))
    .sort((a, b) => attachmentSortRank(a) - attachmentSortRank(b))

  useLayoutEffect(() => {
    const node = bodyRef.current
    if (node) {
      setIsOverflowing(node.scrollHeight > node.clientHeight + 1)
    }
    const strip = attachmentsRef.current
    if (strip) {
      setAttachmentsScrollable(strip.scrollWidth > strip.clientWidth + 1)
    }
  }, [task?.content, attachments.length])

  if (!task) {
    return null
  }

  const handleContentClick = (event: MouseEvent<HTMLDivElement>) => {
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
    const attachment = attachmentId ? attachments.find((item) => item.id === attachmentId) : undefined
    if (!attachment) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setPreviewAttachment(attachment)
  }

  const scrollAttachments = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    attachmentsRef.current?.scrollBy({ left: 88, behavior: 'smooth' })
  }

  return (
    <Fragment>
    <div className="relative h-full rounded-2xl" data-task-id={taskId}>
    {/* A pin for a note that is actually pinned, cellotape otherwise — see TaskCard for the
        fuller reasoning on both (same trick, same reason either has to live outside the tile's
        own overflow-hidden box to hang over the top edge). This is the tile every colourful
        listing in the app actually uses, unlike TaskCard, which only the alternate "List" view
        style renders — so this is the one that has to carry it. */}
    {decorationsEnabled ? (
      pinned ? (
        // A shaded sphere rather than a flat glyph — see taskPinStyle for why: this is meant to
        // read as an object sitting on the note, not as a picture of one. Coloured to match the
        // note's own colour, the same `colors.solid` its picker swatch uses.
        <span
          aria-hidden
          className="pointer-events-none absolute -top-2.5 left-1/2 z-10 h-5 w-5 -translate-x-1/2 rounded-full"
          style={taskPinStyle(colors.solid)}
        />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-[11px] left-1/2 z-10 h-6 w-[72px] -translate-x-1/2 -rotate-2 rounded-[1px]"
          style={TASK_TAPE_STYLE}
        />
      )
    ) : null}
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        // Only when the tile itself has focus. Without this, a space typed into any field inside a
        // dialog opened from this tile bubbled back here — swallowing the space and opening the
        // note. TaskCard has always had this guard; the tile did not.
        if (event.target !== event.currentTarget) {
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        // Fills the grid cell rather than setting its own height — the canvas owns the size.
        'anim-item-in group relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-black/5 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 sm:p-3.5',
        // The same two-part "resting on a surface" shadow as TaskCard's colourful mode — a tight
        // dark edge where the sheet actually touches, a soft wide one from it lifting above that.
        'shadow-[0_1px_2px_rgba(0,0,0,0.16),0_2px_1px_rgba(0,0,0,0.08),0_16px_28px_-10px_rgba(0,0,0,0.4)]',
      )}
      style={{ background: colors.card }}
    >
      {/*
        * The title, and the two things you might do to the tile from here. Nothing else.
        *
        * This row had grown to five items — name, pin marker, tag count, state, menu — on a tile
        * that is 150px wide on a phone, so the name was the thing that gave way. Everything that
        * merely *describes* the note moved to the footer, which is already a metadata strip, and
        * the pin marker went entirely: pinned notes sit under their own "Pinned" heading in every
        * view that pins, and the menu says "Unpin" when you open it.
        *
        * What is left is one control that is genuinely one-tap — the colour on a note, its state
        * on a task — and the menu holding everything else. Both live in one divided pill (see
        * TaskCardControls), pulled up into the card's own padding so it reads as belonging to the
        * corner rather than as the third item in the title's row.
        */}
      <div className="flex h-7 shrink-0 items-center gap-1.5">
        <h3
          className="min-w-0 flex-1 truncate text-[14.5px] font-bold leading-snug tracking-[-0.01em] sm:text-[15.5px]"
          style={{ color: ink }}
          title={task.title.trim() || 'Untitled'}
        >
          {task.title.trim() || 'Untitled'}
        </h3>
        <div className="-mr-1 -mt-1 sm:-mr-1.5 sm:-mt-1.5">
          <TaskCardControls
            ink={ink}
            left={
              isTracked ? (
                <TaskStatusBadge
                  lifecycle={lifecycle}
                  completed={task.completed}
                  iconOnly
                  onToggle={() => toggleCompleted(taskId)}
                />
              ) : (
                <TaskColorButton
                  compact
                  activeColor={colors.solid}
                  selected={task.color}
                  onSelect={(color) => updateTaskColor(taskId, color)}
                />
              )
            }
            right={<TaskActionsMenu task={task} scope={scope} compact ink={ink} />}
          />
        </div>
      </div>

      {/* One hairline instead of per-element borders: it separates header from body without
        *  adding another outlined box to the card. */}
      <div
        className="mt-2 h-px w-full shrink-0"
        style={{ background: `color-mix(in srgb, ${ink} 14%, transparent)` }}
        aria-hidden
      />

      {/* The preview is capped in the content area itself, so truncation is a property of this
        *  box rather than something that pushes the footer around. max-h keeps a long note from
        *  turning one tile into a column of its own; flex-1 lets a short one hand its leftover
        *  space to the row instead of padding the tile out. */}
      <div
        ref={bodyRef}
        onClick={handleContentClick}
        className="relative mt-2 min-h-0 flex-1 overflow-hidden pointer-events-none text-[12.5px]"
        style={{ color: ink }}
      >
        <TaskContentPreview taskId={taskId} content={task.content} />
        {isOverflowing ? (
          // Left-aligned with the text it continues — centered, it read as a stray "..." floating
          // in the middle of the card.
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-5 items-end pl-0.5 text-[13px] font-semibold leading-none"
            style={{ backgroundImage: `linear-gradient(to top, ${colors.card}, transparent)`, color: ink }}
          >
            &hellip;
          </div>
        ) : null}
      </div>

      {/* Everything below here is the tile's footer: attachments, then metadata. Both sit after
        *  the flex-1 content area, so they stay anchored to the bottom edge in every tile. */}
      {attachments.length > 0 ? (
        <div className="mt-2 flex shrink-0 items-center gap-1">
          <div ref={attachmentsRef} className="flex min-w-0 flex-1 gap-1 overflow-x-hidden">
            {attachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setPreviewAttachment(attachment)
                }}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/10"
                style={{ color: ink }}
                aria-label={attachment.name}
              >
                <AttachmentTypeIcon attachment={attachment} className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          {attachmentsScrollable ? (
            <button
              type="button"
              onClick={scrollAttachments}
              aria-label="Show more attachments"
              className={cn(
                'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/10',
              )}
              style={{ color: ink }}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Rendered only when populated — an empty footer row still cost a line of height plus its
        *  margin, which read as dead space under the attachment icons. */}
      {/* The metadata strip: where the note is, what it is tagged, what is scheduled. All of it
        *  reads rather than acts, which is exactly why it can live down here at 10.5px instead of
        *  competing with the title. The tile's own ink carries the colour throughout — a red
        *  countdown on a red card reads as a smudge. */}
      {/*
        * The metadata strip. Two rules keep it on one line on a 150px tile.
        *
        * A finished task shows no countdown here: the card is already the colour of its outcome
        * and the header badge already carries the tick, so "Completed on time" was a third telling
        * of the same thing — and the longest string in the row, which is what pushed the folder
        * label down to "in Note…" and still overflowed. A pending task keeps it, because how long
        * is left is not written anywhere else on the card.
        *
        * And the label yields first when there genuinely isn't room: it shrinks far more readily
        * than the group beside it, which used to refuse to shrink at all and simply overhang.
        */}
      {folderLabel || isTracked || reminderCount > 0 || task.tags.length > 0 ? (
        <div
          className="mt-2 flex shrink-0 items-center justify-between gap-1.5 text-[10.5px] opacity-80 sm:text-[11px]"
          style={{ color: ink }}
        >
          {folderLabel ? (
            <span className="min-w-0 shrink-[10] truncate">in {folderLabel}</span>
          ) : (
            <span />
          )}
          <span className="flex min-w-0 shrink items-center justify-end gap-1">
            <TaskTagsPill tags={task.tags} ink={ink} />
            <ReminderCountPill count={reminderCount} compact hint={reminderHint} />
            {isTracked && task.dueAt && !task.completed ? (
              <span className="min-w-0" style={{ color: ink }} title={formatDueDate(task.dueAt)}>
                <TaskCountdown task={task} compact className="!text-inherit" />
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
    </div>
    <AttachmentPreviewDialog attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    {reopenDialog}
    </Fragment>
  )
}
