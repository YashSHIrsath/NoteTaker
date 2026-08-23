import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { ChevronRight, FolderInput, Pin } from 'lucide-react'
import type { Attachment } from '../../types'
import type { FolderCategory } from '../../lib/folderColor'
import { taskColorStyle } from '../../lib/taskColor'
import { formatDueDate } from '../../lib/dueDate'
import { findBlockAttachmentId, referencedAttachmentIds } from '../../lib/blockNoteContent'
import { useFolders } from '../../hooks/useFolders'
import { AttachmentPreviewDialog } from '../attachment/AttachmentPreviewDialog'
import { TaskColorButton } from './TaskColorButton'
import { MoveTaskDialog } from './MoveTaskDialog'
import { TaskTagsPill } from './TaskTagsPill'
import { AttachmentTypeIcon, attachmentSortRank } from '../attachment/AttachmentTypeIcon'
import { TaskContentPreview } from './TaskContentPreview'
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
  category: FolderCategory
  folderLabel?: string
  onOpen: () => void
}

/** A single-color sticky-note tile for the flat "all tasks" grid.
 *
 *  One fixed height for every tile — a portrait rectangle — so the grid stays even whatever a note
 *  contains. Fixed in pixels rather than as an aspect ratio on purpose: an aspect ratio ties height
 *  to column width, which is what turned these into tall empty squares on a wide screen. */
export function AllTaskTile({ taskId, category, folderLabel, onOpen }: AllTaskTileProps) {
  const { getTask, getAttachmentsForTask, updateTaskColor } =
    useFolders()
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [attachmentsScrollable, setAttachmentsScrollable] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const attachmentsRef = useRef<HTMLDivElement>(null)

  const task = getTask(taskId)
  // An explicit pick wins; without one the view's own rule (folder color, or the scatter in a
  // flat list) still decides, exactly as before the picker existed.
  const colors = taskColorStyle(task?.color ?? null, category)
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

  const folderId = task?.folderId ?? null
  const scrollAttachments = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    attachmentsRef.current?.scrollBy({ left: 88, behavior: 'smooth' })
  }

  return (
    <Fragment>
    <div className="h-full rounded-2xl">
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        // Fills the grid cell rather than setting its own height — the canvas owns the size.
        'anim-item-in group flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 sm:p-3.5',
      )}
      style={{ background: colors.card }}
    >
      {/* Plain weighted text, no chrome: the title is the one thing on the tile that doesn't need
        *  a chip around it, which is what lets the small pills beside it read as metadata.
        *
        *  One line, truncated — a two-line title made the row taller than the pills beside it and
        *  pushed the divider (and everything under it) out of step with the next tile. Fixed height
        *  plus items-center is what puts the title, the pin, the tag count and the colour dot on
        *  one baseline. */}
      <div className="flex h-7 shrink-0 items-center gap-1.5">
        <h3
          className="min-w-0 flex-1 truncate text-[14.5px] font-bold leading-snug tracking-[-0.01em] sm:text-[15.5px]"
          style={{ color: ink }}
          title={task.title.trim() || 'Untitled'}
        >
          {task.title.trim() || 'Untitled'}
        </h3>
        {task.isPinned ? (
          <Pin className="h-3.5 w-3.5 shrink-0 fill-current" style={{ color: ink }} aria-label="Pinned" />
        ) : null}
        {/* Tags live here as a count, opening on click — see TaskTagsPill. */}
        <TaskTagsPill tags={task.tags} ink={ink} />
        {/* Dragging a tile now places it on the canvas, so this is how a note changes folder. */}
        {folderId ? (
          <button
            type="button"
            aria-label={`Move ${task.title.trim() || 'note'} to another folder`}
            title="Move to folder"
            onClick={(event) => {
              event.stopPropagation()
              setMoveOpen(true)
            }}
            className="anim-press inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
            style={{ color: ink }}
          >
            <FolderInput className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
        <TaskColorButton
          compact
          activeColor={colors.solid}
          selected={task.color}
          onSelect={(color) => updateTaskColor(taskId, color)}
        />
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
      {folderLabel || task.dueAt ? (
        <div
          className="mt-2 flex shrink-0 items-center justify-between gap-2 text-[10.5px] opacity-80 sm:text-[11px]"
          style={{ color: ink }}
        >
          {folderLabel ? <span className="min-w-0 truncate">in {folderLabel}</span> : <span />}
          {task.dueAt ? <span className="shrink-0 truncate">{formatDueDate(task.dueAt)}</span> : null}
        </div>
      ) : null}
    </div>
    </div>
    <MoveTaskDialog open={moveOpen} taskId={taskId} onClose={() => setMoveOpen(false)} />
    <AttachmentPreviewDialog attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </Fragment>
  )
}
