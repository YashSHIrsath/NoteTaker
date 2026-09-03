import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useState } from 'react'
import { Copy, X } from 'lucide-react'
import type { FolderNode } from '../../types'
import { IconButton } from '../ui/IconButton'
import { useFolders } from '../../hooks/useFolders'
import { categoryVar, getRootCategoryForFolder } from '../../lib/folderColor'
import { cn } from '../../lib/cn'

export interface DuplicateTaskDialogProps {
  open: boolean
  taskId: string
  onClose: () => void
}

interface FlatFolder {
  id: string
  name: string
  depth: number
}

/** The tree, flattened in reading order with a depth for indentation — the same shape
 *  MoveTaskDialog builds its own list from, kept here rather than shared because the two lists
 *  differ in one thing MoveTaskDialog cares about and this doesn't: which folder is "the current
 *  one" to mark and skip. A duplicate has no current folder to exclude — copying into the note's
 *  own folder is a completely ordinary choice, not a no-op the way moving it there would be. */
function flatten(nodes: FolderNode[], depth = 0, out: FlatFolder[] = []): FlatFolder[] {
  for (const node of nodes) {
    out.push({ id: node.id, name: node.name, depth })
    flatten(node.children, depth + 1, out)
  }
  return out
}

/**
 * Makes an independent copy of a note in a folder you choose.
 *
 * The choice is worth asking rather than assuming: a duplicate is as often "start tomorrow's
 * version of this in a different folder" as it is "one more like this one, right here" — Move
 * already asks the same question for the same reason, and this is deliberately the same dialog
 * shape so choosing a destination reads as one idea learned once.
 *
 * No exit animation on confirm, unlike Move: moving a task can remove the card you're looking at
 * from the view you're in, which is worth animating; duplicating only ever adds a card somewhere,
 * never takes one away, so there is nothing here for that animation to explain.
 */
export function DuplicateTaskDialog({ open, taskId, onClose }: DuplicateTaskDialogProps) {
  const { getTask, getForest, folders, duplicateTask } = useFolders()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()

  const task = getTask(taskId)
  const options = useMemo(() => flatten(getForest()), [getForest])

  useEffect(() => {
    if (!open) {
      return
    }
    // Cleared on every fresh open, not just on success — an error from a previous attempt has
    // nothing to say about the destination this new attempt is about to try.
    setError(null)
  }, [open, taskId])

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
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    void duplicateTask(taskId, folderId)
      .then(() => onClose())
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : 'Could not duplicate that note. Please try again.',
        )
      })
      .finally(() => setBusy(false))
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center px-3 pb-[calc(var(--bottom-nav-inset)+0.5rem)] sm:items-center sm:p-4"
      // See MoveTaskDialog for why this is stopped at the dialog's own root: a portal renders into
      // <body>, but React still routes events up the *component* tree, so an unstopped click here
      // would reach the card this opened from and open the note behind the dialog.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
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
        className="anim-dialog-in relative flex max-h-[min(58dvh,26rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none sm:max-h-[min(90vh,34rem)] sm:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--color-border-strong)] sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]"
              aria-hidden
            >
              <Copy className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-[15px] font-semibold text-[var(--color-text)] sm:text-base">
                Duplicate note
              </h2>
              <p className="truncate text-[12px] text-[var(--color-text-muted)]">
                Choose a folder for the copy of {task.title.trim() || 'this note'}
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
            const isSourceFolder = option.id === task.folderId
            const category = getRootCategoryForFolder(folders, option.id)
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => choose(option.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]/25',
                    'disabled:opacity-60',
                    'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
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
                  {/* Named rather than checked: this folder isn't the destination until tapped,
                      only the note's *current* one — worth saying, since "here" is usually
                      exactly where a duplicate belongs, but it is a fact about the note, not a
                      selection state the way MoveTaskDialog's check mark is. */}
                  {isSourceFolder ? (
                    <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
                      Current
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

        {error ? (
          <p className="border-t border-[var(--color-border)] px-4 py-2.5 text-[12.5px] text-[var(--color-danger)] sm:px-5">
            {error}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
