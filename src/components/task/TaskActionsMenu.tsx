import { Fragment, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarClock,
  FolderInput,
  MoreVertical,
  Pin,
  PinOff,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react'
import type { Task, TaskListScope } from '../../types'
import { IconButton } from '../ui/IconButton'
import { MoveTaskDialog } from './MoveTaskDialog'
import { TaskScheduleDialog } from './TaskScheduleDialog'
import { useFolders } from '../../hooks/useFolders'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import { cn } from '../../lib/cn'

const MENU_WIDTH = 216

/** What to call each listing in the pin row, so "Pin to top of Starred" is unambiguous about
 *  which of the three it affects. */
const SCOPE_LABELS: Record<TaskListScope, string> = {
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
  const { toggleTaskImportant, toggleTaskPinned } = useFolders()
  const { requestTaskDelete, dialog: deleteDialog } = useDeleteTask()
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const menu = useAnchoredPanel<HTMLDivElement>(MENU_WIDTH)

  const title = task.title.trim() || 'Untitled'
  const pinnedHere = task.pinnedScopes.includes(scope)
  const iconClass = 'h-3.5 w-3.5 shrink-0'

  const items: TaskMenuItem[] = [
    ...extraItems,
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
          className={cn(compact ? 'h-6 w-6' : 'h-7 w-7')}
          style={ink ? { color: ink } : undefined}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            menu.setOpen((open) => !open)
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
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
      {deleteDialog}
    </Fragment>
  )
}
