import { useEffect, useId, useMemo, useState } from 'react'
import { Check, FolderInput, X } from 'lucide-react'
import type { FolderNode } from '../../types'
import { IconButton } from '../ui/IconButton'
import { useFolders } from '../../hooks/useFolders'
import { categoryVar, getRootCategoryForFolder } from '../../lib/folderColor'
import { cn } from '../../lib/cn'

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
    void Promise.resolve(moveTaskToFolder(taskId, folderId))
      .catch(() => {
        /* the persist banner explains a failed save */
      })
      .finally(() => {
        setBusy(false)
        onClose()
      })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
        className="anim-dialog-in relative flex max-h-[min(90vh,32rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]"
              aria-hidden
            >
              <FolderInput className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[15px] font-semibold text-[var(--color-text)]">
                Move note
              </h2>
              <p className="truncate text-[12px] text-[var(--color-text-muted)]">{task.title}</p>
            </div>
          </div>
          <IconButton label="Close" onClick={busy ? undefined : onClose} disabled={busy}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
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
                    'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/25',
                    'disabled:opacity-60',
                    current
                      ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent-ink)]'
                      : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                  )}
                  // Indent by depth so the hierarchy is readable without drawing a whole tree.
                  style={{ paddingLeft: `${0.625 + option.depth * 0.875}rem` }}
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
            <li className="px-2.5 py-3 text-sm text-[var(--color-text-muted)]">No folders yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
