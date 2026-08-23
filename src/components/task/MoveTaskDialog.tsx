import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useState } from 'react'
import { Check, FolderInput, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import type { FolderNode } from '../../types'
import { IconButton } from '../ui/IconButton'
import { useFolders } from '../../hooks/useFolders'
import { categoryVar, getRootCategoryForFolder } from '../../lib/folderColor'
import { cn } from '../../lib/cn'
import { performWithTaskExit } from '../../lib/taskExitAnimation'

export interface MoveTaskDialogProps {
  open: boolean
  taskId: string
  onClose: () => void
}

interface FlatFolder {
  id: string
  name: string
  depth: number
}

/** The tree, flattened in reading order with a depth for indentation — a picker wants one scannable
 *  column, not a second expand/collapse interaction on top of the one it is already inside. */
function flatten(nodes: FolderNode[], depth = 0, out: FlatFolder[] = []): FlatFolder[] {
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, depth })
    flatten(node.children, depth + 1, out)
  }
  return out
}

/**
 * Moves a task to another folder.
 *
 * This exists because dragging a card no longer moves it: on the resizable canvas a drag places
 * the card, so the gesture that used to drop a task onto a folder has been taken. Without this the
 * app would simply have lost the ability to move a note between folders.
 */
export function MoveTaskDialog({ open, taskId, onClose }: MoveTaskDialogProps) {
  const { getTask, getForest, folders, moveTaskToFolder } = useFolders()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const titleId = useId()

  const task = getTask(taskId)
  const currentFolderId = task?.folderId ?? null
  const options = useMemo(() => flatten(getForest()), [getForest])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose, open])

  if (!open || !task) {
    return null
  }

  const choose = (folderId: string) => {
    if (folderId === currentFolderId || busy) {
      onClose()
      return
    }
    setBusy(true)
    // A move only removes the card while we are viewing its source folder. In a cross-folder
    // view (Tasks or Important) it remains visible, so playing an exit there would be misleading.
    const exitsCurrentView = location.pathname === `/folder/${currentFolderId}`
    const move = () => moveTaskToFolder(taskId, folderId)
    const operation = exitsCurrentView
      ? performWithTaskExit(taskId, move)
      : Promise.resolve(move())
    void operation
      .catch(() => {
        /* the persist banner explains a failed save */
      })
      .finally(() => {
        setBusy(false)
        onClose()
      })
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center px-3 pb-[calc(var(--bottom-nav-inset)+0.5rem)] sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={busy ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Below sm this is a popup that rises out of the bottom bar, sharing the subfolders
        // sheet's gutter, width cap and clearance so the two sit in exactly the same place. It
        // used to be a full-bleed sheet pinned to the bottom edge at 82dvh, which covered the bar
        // and took the whole lower half of the screen to offer a list of six folders.
        className="anim-dialog-in relative flex max-h-[min(58dvh,26rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none sm:max-h-[min(90vh,34rem)] sm:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--color-border-strong)] sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]"
              aria-hidden
            >
              <FolderInput className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[15px] font-semibold text-[var(--color-text)] sm:text-base">
                Move note
              </h2>
              <p className="truncate text-[12px] text-[var(--color-text-muted)]">
                Choose a folder for {task.title.trim() || 'this note'}
              </p>
            </div>
          </div>
          <IconButton label="Close" onClick={busy ? undefined : onClose} disabled={busy}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="border-b border-[var(--color-border)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:px-5">
          Folders
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-3">
          {options.map((option) => {
            const current = option.id === currentFolderId
            const category = getRootCategoryForFolder(folders, option.id)
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => choose(option.id)}
                  aria-current={current ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/25',
                    'disabled:opacity-60',
                    current
                      ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent-ink)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                  )}
                  // Indent by depth so the hierarchy is readable without drawing a whole tree.
                  style={{ paddingLeft: `${0.75 + option.depth * 0.875}rem` }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: categoryVar(category) }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  {current ? (
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
          {options.length === 0 ? (
            <li className="px-3 py-4 text-sm text-[var(--color-text-muted)]">No folders yet.</li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
