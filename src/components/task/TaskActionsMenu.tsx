import { Fragment, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarClock,
  Copy,
  FolderInput,
  Globe,
  Lock,
  MoreVertical,
  Pin,
  PinOff,
  Star,
  StarOff,
  Trash2,
  Users,
} from 'lucide-react'
import type { Task, TaskListScope } from '../../types'
import { IconButton } from '../ui/IconButton'
import { MoveTaskDialog } from './MoveTaskDialog'
import { DuplicateTaskDialog } from './DuplicateTaskDialog'
import { TaskScheduleDialog } from './TaskScheduleDialog'
import { useFolders } from '../../hooks/useFolders'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import { useIsSpace } from '../../hooks/useWorkspace'
import { ShareDialog } from '../sharing/ShareDialog'
import { VISIBILITY_LABELS, ownVisibility } from '../../lib/contentPrivacy'
import { cn } from '../../lib/cn'

/**
 * The compact trigger's mark: a disc with a pencil cut out of it.
 *
 * It replaces three dots, and the reason is the control beside it. In a card's corner this menu
 * shares a capsule with the colour swatch, which is a small filled circle — so the pair was a round
 * thing next to a row of dots, two different kinds of shape doing the same job at the same size. A
 * disc of its own makes them read as one set, and the pencil is what keeps it from reading as a
 * second colour: the same coin, with a mark on it.
 *
 * Cut out with a mask rather than drawn on top, so the pencil is a *hole* and whatever is behind the
 * disc shows through it. That is what lets this work anywhere without being told the card's colour —
 * inside the capsule it shows the capsule's tint, on a bare surface it shows the surface. Drawing the
 * pencil in a second colour would have meant plumbing the card's own background down to here, and
 * getting it wrong on a custom colour.
 *
 * Hand-drawn rather than a lucide pencil over a lucide circle: at 13px a stroked icon inside another
 * stroked icon is two hairlines and a smudge. A silhouette punched out of a solid disc is one shape,
 * and a hole has area where a stroke has none.
 */
function PencilDisc({ className }: { className?: string }) {
  // The id goes into a url(#…) fragment reference, which is not a CSS selector — but React's own ids
  // contain colons, and stripping them keeps this valid anywhere the markup is inspected or copied.
  const maskId = `pencil-disc-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden focusable="false">
      <mask id={maskId}>
        {/* White keeps, black cuts. */}
        <rect width="16" height="16" fill="#fff" />
        {/* A pencil on the diagonal: flat end top-right, point bottom-left. */}
        <path d="M9.95 4.15L11.85 6.05L7.15 10.75L4.5 11.5L5.25 8.85Z" fill="#000" />
      </mask>
      <circle cx="8" cy="8" r="8" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  )
}

const MENU_WIDTH = 216

/** What to call each listing in the pin row, so "Pin to top of Starred" is unambiguous about
 *  which of the three it affects. Exported so TaskEditorDialog's own pin control — which reads
 *  from whichever page opened it, see its `scope` prop — says the same thing this menu does. */
export const SCOPE_LABELS: Record<TaskListScope, string> = {
  folder: 'this folder',
  tasks: 'Tasks',
  important: 'Starred',
}

export interface TaskMenuItem {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  danger?: boolean
}

export interface TaskActionsMenuProps {
  task: Task
  /** Which listing this card is being drawn in. Pinning is per-listing, so the menu has to say
   *  which one it means — see Task.pinnedScopes. */
  scope: TaskListScope
  compact?: boolean
  /** Ink colour for the trigger on a coloured tile, where the neutral muted token disappears. */
  ink?: string
  /** Items placed above the shared ones — the note editor's view toggles, which mean nothing on a
   *  card. */
  extraItems?: TaskMenuItem[]
}

/**
 * One button for everything you can do to a note.
 *
 * These actions used to sit in a row: move, schedule, pin, star, delete, plus whatever the surface
 * added. Six controls at 24-28px each is most of a card's width, and on a note header it pushed the
 * title into a truncated stub — the name of the thing being acted on lost to the actions. They are
 * all infrequent and none of them needs to be one tap.
 *
 * What stays outside is deliberately only what *reports* rather than acts: the status badge, the
 * countdown, the reminder count. Those are the answers you open a card to read.
 */
export function TaskActionsMenu({
  task,
  scope,
  compact = false,
  ink,
  extraItems = [],
}: TaskActionsMenuProps) {
  const { toggleTaskImportant, toggleTaskPinned, sharingIndex } = useFolders()
  const { requestTaskDelete, dialog: deleteDialog } = useDeleteTask()
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const isSpace = useIsSpace()
  const menu = useAnchoredPanel<HTMLDivElement>(MENU_WIDTH)

  const title = task.title.trim() || 'Untitled'
  const pinnedHere = task.pinnedScopes.includes(scope)
  const iconClass = 'h-3.5 w-3.5 shrink-0'

  /* The note's *own* level, not what it effectively reaches — this row opens the picker, and the
     picker edits the note's own setting. What it actually reaches, folders above it included, is what
     the badge on the card says. */
  const visibility = ownVisibility(sharingIndex, 'task', task.id)
  const VisibilityIcon =
    visibility === 'private' ? Lock : visibility === 'restricted' ? Users : Globe

  const items: TaskMenuItem[] = [
    ...extraItems,
    // Only inside a space. Personal notes have one reader, so there is no question to ask.
    ...(isSpace
      ? [
          {
            key: 'share',
            label: `Who can see this · ${VISIBILITY_LABELS[visibility]}`,
            icon: <VisibilityIcon className={iconClass} aria-hidden />,
            onSelect: () => setShareOpen(true),
          },
        ]
      : []),
    {
      key: 'schedule',
      label: task.noteKind === 'due_task' ? 'Due date & reminders' : 'Add due date or reminder',
      icon: <CalendarClock className={iconClass} aria-hidden />,
      onSelect: () => setScheduleOpen(true),
    },
    {
      key: 'move',
      label: 'Move to folder',
      icon: <FolderInput className={iconClass} aria-hidden />,
      onSelect: () => setMoveOpen(true),
    },
    {
      key: 'duplicate',
      label: 'Duplicate to folder',
      icon: <Copy className={iconClass} aria-hidden />,
      onSelect: () => setDuplicateOpen(true),
    },
    {
      key: 'pin',
      // Named for the listing, because pinning here says nothing about the other two.
      label: pinnedHere ? `Unpin from ${SCOPE_LABELS[scope]}` : `Pin to top of ${SCOPE_LABELS[scope]}`,
      icon: pinnedHere ? (
        <PinOff className={iconClass} aria-hidden />
      ) : (
        <Pin className={iconClass} aria-hidden />
      ),
      onSelect: () => toggleTaskPinned(task.id, scope),
    },
    {
      key: 'star',
      label: task.isImportant ? 'Remove from Starred' : 'Add to Starred',
      icon: task.isImportant ? (
        <StarOff className={iconClass} aria-hidden />
      ) : (
        <Star className={iconClass} aria-hidden />
      ),
      onSelect: () => toggleTaskImportant(task.id),
    },
    {
      key: 'delete',
      label: 'Delete note',
      icon: <Trash2 className={iconClass} aria-hidden />,
      onSelect: () => requestTaskDelete(task.id),
      danger: true,
    },
  ]

  return (
    <Fragment>
      <div ref={menu.anchorRef} className="shrink-0">
        <IconButton
          label={`Actions for ${title}`}
          aria-expanded={menu.open}
          // box="none": this trigger is sized to the pill it sits in (24px), not to the default
          // touch target, and the base's own responsive size would override a bare className.
          box="none"
          className={cn(compact ? 'h-[22px] w-[22px]' : 'h-7 w-7')}
          style={ink ? { color: ink } : undefined}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            menu.setOpen((open) => !open)
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {/* A disc in the capsule, dots on their own.
            *
            * Compact, this sits beside the colour swatch in one capsule, and the swatch is a 13px
            * filled circle — so the mark here is the same circle at the same size, told apart by the
            * pencil cut out of it and by its colour (the card's ink, where the swatch carries the
            * card's own colour). See PencilDisc.
            *
            * Where the trigger stands on its own there is nothing to match, and nothing enclosing it
            * either, so the vertical dots stay: the axis of the row is what they should follow. */}
          {compact ? (
            <PencilDisc className="h-[13px] w-[13px]" />
          ) : (
            <MoreVertical className="h-4 w-4" aria-hidden />
          )}
        </IconButton>
      </div>

      {menu.open && menu.position
        ? createPortal(
            <div
              ref={menu.panelRef}
              role="menu"
              aria-label={`Actions for ${title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className="anim-panel-in fixed z-[60] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
              style={{ top: menu.position.top, left: menu.position.left, width: MENU_WIDTH }}
            >
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    menu.setOpen(false)
                    item.onSelect()
                  }}
                  className={cn(
                    // 36px rows: this is the one place these actions live now, including on a
                    // phone, so each has to be a comfortable target rather than an icon-sized one.
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
                    item.danger
                      ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                  )}
                >
                  {item.icon}
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      <TaskScheduleDialog open={scheduleOpen} task={task} onClose={() => setScheduleOpen(false)} />
      <MoveTaskDialog open={moveOpen} taskId={task.id} onClose={() => setMoveOpen(false)} />
      <DuplicateTaskDialog open={duplicateOpen} taskId={task.id} onClose={() => setDuplicateOpen(false)} />
      {shareOpen ? (
        <ShareDialog
          open
          entityType="task"
          entityId={task.id}
          entityName={title}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      {deleteDialog}
    </Fragment>
  )
}
