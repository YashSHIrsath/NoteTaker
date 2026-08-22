import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ChevronRight, Pin } from 'lucide-react'
import type { Attachment } from '../../types'
import type { FolderCategory } from '../../lib/folderColor'
import { taskColorStyle } from '../../lib/taskColor'
import { formatDueDate } from '../../lib/dueDate'
import { findBlockAttachmentId, referencedAttachmentIds } from '../../lib/blockNoteContent'
import { useFolders } from '../../hooks/useFolders'
import { useItemDnd } from '../../context/ItemDndContext'
import { AttachmentPreviewDialog } from '../attachment/AttachmentPreviewDialog'
import { TaskColorButton } from './TaskColorButton'
import { AttachmentTypeIcon, attachmentSortRank } from '../attachment/AttachmentTypeIcon'
import { TaskContentPreview } from './TaskContentPreview'
import { cn } from '../../lib/cn'

const MAX_VISIBLE_TAGS = 3
const DRAG_TYPE = 'text/plain'
/** Hold before a touch on a tile becomes a drag rather than a tap or a scroll. */
const TOUCH_HOLD_MS = 320

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
 *  Height is content-driven between a floor and a ceiling rather than locked to a square: a
 *  square tile's height was dictated by the column width, which meant a narrow column starved
 *  the content while a wide one left a large empty gap above the footer. Tiles in the same grid
 *  row still line up, because grid items stretch to their row. */
export function AllTaskTile({ taskId, category, folderLabel, onOpen }: AllTaskTileProps) {
  const { getTask, getAttachmentsForTask, updateTaskColor, reorderSiblingTasks, moveTaskToFolder } =
    useFolders()
  const { dragging, dropHint, getDragging, beginDrag, updateDropHint, endDrag, startPointerDrag, isPointerDragging } =
    useItemDnd()
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [attachmentsScrollable, setAttachmentsScrollable] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
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

  const visibleTags = task.tags.slice(0, MAX_VISIBLE_TAGS)
  const extraTagCount = task.tags.length - visibleTags.length

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
  const isDragging = dragging?.kind === 'task' && dragging.itemId === taskId
  // Tiles sit in a grid, so the insertion point reads as a vertical edge — left or right of the
  // tile under the pointer — rather than the above/below a single-column list uses.
  const hint = dropHint?.kind === 'task' && dropHint.itemId === taskId ? dropHint.position : null

  const dropPositionFrom = (clientX: number, element: HTMLElement): 'before' | 'after' => {
    const rect = element.getBoundingClientRect()
    return clientX < rect.left + rect.width / 2 ? 'before' : 'after'
  }

  const isOtherTaskInSameFolder = (session: ReturnType<typeof getDragging>) =>
    session !== null && session.kind === 'task' && session.itemId !== taskId && session.groupId === folderId

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_TYPE, taskId)
    beginDrag({ kind: 'task', itemId: taskId, groupId: folderId })
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isOtherTaskInSameFolder(getDragging())) {
      return
    }
    event.preventDefault()
    updateDropHint({
      kind: 'task',
      itemId: taskId,
      position: dropPositionFrom(event.clientX, event.currentTarget),
    })
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const session = getDragging()
    if (!isOtherTaskInSameFolder(session)) {
      // Not a same-folder reorder — leave the event to bubble to whatever ancestor can handle it.
      return
    }
    event.preventDefault()
    reorderSiblingTasks(session!.itemId, taskId, dropPositionFrom(event.clientX, event.currentTarget))
    endDrag()
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (folderId === null) {
      return
    }
    // A hold on one of the tile's own controls (the color swatch, an attachment chip) belongs to
    // that control. The tile body is a role="button" div, not a <button>, so it still drags.
    if ((event.target as HTMLElement).closest('button, a, input, textarea, label')) {
      return
    }
    startPointerDrag(
      event,
      { kind: 'task', itemId: taskId, groupId: folderId },
      { reorder: reorderSiblingTasks, moveToZone: (zoneId) => moveTaskToFolder(taskId, zoneId) },
      { holdMs: TOUCH_HOLD_MS },
    )
  }

  const scrollAttachments = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    attachmentsRef.current?.scrollBy({ left: 88, behavior: 'smooth' })
  }

  return (
    <Fragment>
    {/* The drop indicator and the drag wiring live on a wrapper so the tile itself keeps its own
        rounding and overflow clipping — a border on the tile would shift its contents. */}
    <div
      draggable={folderId !== null}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={() => endDrag()}
      onPointerDown={handlePointerDown}
      data-dnd-item={taskId}
      data-dnd-kind="task"
      data-dnd-group={folderId ?? ''}
      className={cn(
        'h-full rounded-2xl border-x-2 border-transparent',
        hint === 'before' && 'border-l-[var(--color-accent)]',
        hint === 'after' && 'border-r-[var(--color-accent)]',
      )}
    >
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        // A touch drag ends with a click on the tile it was dropped on; that shouldn't open it.
        if (isPointerDragging()) {
          return
        }
        onOpen()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'anim-item-in group flex h-full min-h-[128px] w-full flex-col overflow-hidden rounded-2xl p-3 text-left transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 sm:p-3.5',
        isDragging && 'opacity-60 ring-2 ring-[var(--color-accent)]',
      )}
      style={{ background: colors.card }}
    >
      {/* The title used to be a bordered pill too, which put it in the same visual bracket as the
        *  tag chips right under it — two rounded, tinted, outlined things arguing over which was
        *  the heading. The title is now plain weighted text (the one thing on the card with no
        *  chrome), so the chips below can only read as metadata. */}
      <div className="flex items-start gap-1.5">
        <h3
          className="min-w-0 flex-1 text-[14.5px] font-bold leading-snug tracking-[-0.01em] line-clamp-2 sm:text-[15.5px]"
          style={{ color: ink }}
        >
          {task.title.trim() || 'Untitled'}
        </h3>
        {task.isPinned ? (
          <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-current" style={{ color: ink }} aria-label="Pinned" />
        ) : null}
        <TaskColorButton
          compact
          activeColor={colors.solid}
          selected={task.color}
          onSelect={(color) => updateTaskColor(taskId, color)}
        />
      </div>

      {visibleTags.length > 0 ? (
        // Borderless tint plus a "#": these are the only chips on the card now, so they can't be
        // confused with the heading above them.
        <div className="mt-1.5 flex shrink-0 flex-wrap items-center gap-1">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-[6rem] items-center gap-0.5 rounded-full px-2 py-[3px] text-[10.5px] font-semibold leading-none tracking-wide"
              style={{ color: ink, background: `color-mix(in srgb, ${ink} 16%, transparent)` }}
            >
              <span className="opacity-50">#</span>
              <span className="min-w-0 truncate">{tag}</span>
            </span>
          ))}
          {extraTagCount > 0 ? (
            <span
              className="inline-flex shrink-0 items-center rounded-full px-1.5 py-[3px] text-[10.5px] font-semibold leading-none"
              style={{ color: ink, background: `color-mix(in srgb, ${ink} 16%, transparent)` }}
            >
              +{extraTagCount}
            </span>
          ) : null}
        </div>
      ) : null}

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
        className="relative mt-2 min-h-0 flex-1 overflow-hidden pointer-events-none text-[12.5px] max-h-44"
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
    <AttachmentPreviewDialog attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </Fragment>
  )
}
