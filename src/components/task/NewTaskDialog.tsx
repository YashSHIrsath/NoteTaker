import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { ClipboardList, Folder as FolderIcon, FolderPlus, Globe, Lock, X } from 'lucide-react'
import type { ContentVisibility, FolderNode, Task } from '../../types'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { useFolders } from '../../hooks/useFolders'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useIsSpace } from '../../hooks/useWorkspace'
import { cn } from '../../lib/cn'
import '../tree/folder-tree.css'

export interface NewTaskDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (task: Task) => void
}

interface FlatFolder {
  id: string
  name: string
  depth: number
}

/** Flat view of the same forest, used for lookups and for validating the current selection. */
function flatten(nodes: FolderNode[], depth = 0): FlatFolder[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth },
    ...flatten(node.children, depth + 1),
  ])
}

/** Geometry for the connector lines drawn by folder-tree.css: the trunk sits under the parent
 *  row's folder glyph: children indent 22px, so the trunk sits 9px to their left, and each arm
 *  meets its child row at the row's vertical center. */
const PICKER_GROUP_STYLE = {
  paddingLeft: 22,
  '--tree-line-x': '-9px',
  '--tree-elbow-y': '12px',
} as CSSProperties

interface PickerBranchProps {
  nodes: FolderNode[]
  selectedId: string | null
  onSelect: (folderId: string) => void
  depth: number
}

/** Renders the folder forest as an actual tree — nested lists carrying the same elbow connectors
 *  the Tree page uses, so "which folder is inside which" is readable at a glance instead of being
 *  implied by indentation alone. */
function PickerBranch({ nodes, selectedId, onSelect, depth }: PickerBranchProps) {
  return (
    <ul
      className={cn(depth === 0 ? 'folder-tree' : 'folder-tree-group', 'flex flex-col gap-0.5')}
      style={depth === 0 ? undefined : PICKER_GROUP_STYLE}
      role={depth === 0 ? 'tree' : 'group'}
    >
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedId === node.id}
            onClick={() => onSelect(node.id)}
            className={cn(
              'flex w-full min-w-0 items-center gap-1.5 rounded-full px-1.5 py-1 text-left text-[12.5px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
              selectedId === node.id
                ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent-ink)]'
                : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
            )}
          >
            <FolderIcon
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                selectedId === node.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]',
              )}
              aria-hidden
            />
            <span className="min-w-0 truncate">{node.name}</span>
          </button>
          {node.children.length > 0 ? (
            <PickerBranch
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Creating a task from the Tasks page has no folder context to inherit, so the folder is picked
 *  here — including creating one on the spot, which is the only path that works in a brand-new
 *  workspace where there's nowhere to put a task yet. */
export function NewTaskDialog({ open, onClose, onCreated }: NewTaskDialogProps) {
  const { getForest, createFolder, createTask } = useFolders()
  const [title, setTitle] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  // The new folder went under whatever was selected, and something is always selected — so there
  // was no way to create a top-level folder from here. Now the destination is explicit.
  const [newFolderAtRoot, setNewFolderAtRoot] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [visibility, setVisibility] = useState<ContentVisibility>('space')
  const isSpace = useIsSpace()
  const [creatingFolder, setCreatingFolder] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const newFolderRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const titleFieldId = useId()

  const forest = useMemo(() => getForest(), [getForest])
  const folderList = useMemo(() => flatten(forest), [forest])

  // Reset keys off `open` alone. Creating a folder from inside this dialog changes folderList,
  // and resetting on that would wipe a half-typed task title mid-flow.
  useEffect(() => {
    if (!open) {
      return
    }
    setTitle('')
    setNewFolderOpen(false)
    setNewFolderName('')
    setNewFolderAtRoot(false)
    setSubmitting(false)
    setCreatingFolder(false)
  }, [open])

  // Pre-select so the common case is a single click, and keep the selection valid as folders come
  // and go — including the folder just created here, which is already selected by then.
  useEffect(() => {
    setFolderId((current) =>
      current && folderList.some((folder) => folder.id === current)
        ? current
        : (folderList[0]?.id ?? null),
    )
  }, [folderList])

  useDialogFocus(open, titleRef)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, submitting])

  useEffect(() => {
    if (newFolderOpen) {
      newFolderRef.current?.focus()
    }
  }, [newFolderOpen])

  if (!open) {
    return null
  }

  // A new folder nests under the current selection when there is one, so "New folder" doubles as
  // "New subfolder" without needing a second control.
  const selectedFolder = folderList.find((folder) => folder.id === folderId)
  // No folders yet means there is nowhere to nest, so the only possible destination is the root.
  const newFolderParent = newFolderAtRoot ? undefined : selectedFolder

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim()
    if (!trimmed || creatingFolder) {
      return
    }
    setCreatingFolder(true)
    void createFolder(trimmed, newFolderParent?.id ?? null)
      .then((folder) => {
        setFolderId(folder.id)
        setNewFolderName('')
        setNewFolderOpen(false)
      })
      .catch(() => {
        /* persistError banner explains the failure */
      })
      .finally(() => {
        setCreatingFolder(false)
      })
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!folderId || submitting) {
      return
    }
    setSubmitting(true)
    /* Only me or Everyone. Narrowing to named people needs the member list and a sentence about what
       they will also start receiving — that belongs in the share sheet, one tap away from the new
       note's own menu, not squeezed under a folder picker. */
    void createTask(title.trim() || 'New note', folderId, isSpace ? visibility : undefined)
      .then((task) => {
        onCreated(task)
        onClose()
      })
      .catch(() => {
        /* persistError banner explains the failure */
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={submitting ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="anim-dialog-in relative flex max-h-[min(90vh,36rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)]"
              aria-hidden
            >
              <ClipboardList className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
            </span>
            <h2 id={headingId} className="text-[15px] font-semibold text-[var(--color-text)]">
              New task
            </h2>
          </div>
          <IconButton label="Close" onClick={submitting ? undefined : onClose} disabled={submitting}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <form className="flex min-h-0 flex-col overflow-y-auto px-4 py-4" onSubmit={handleSubmit}>
          <label htmlFor={titleFieldId} className="block text-sm font-medium text-[var(--color-text-muted)]">
            Task title
          </label>
          <input
            ref={titleRef}
            id={titleFieldId}
            name="task-title"
            value={title}
            placeholder="New note"
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            autoComplete="off"
          />

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--color-text-muted)]">Place in folder</span>
            <button
              type="button"
              onClick={() => setNewFolderOpen((value) => !value)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
            >
              <FolderPlus className="h-3.5 w-3.5" aria-hidden />
              New folder
            </button>
          </div>

          {newFolderOpen ? (
            <div className="mt-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5">
              <input
                ref={newFolderRef}
                value={newFolderName}
                placeholder="Folder name"
                onChange={(event) => setNewFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Enter in this field means "create the folder", not "submit the task".
                    event.preventDefault()
                    handleCreateFolder()
                  }
                }}
                className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                autoComplete="off"
              />
              {selectedFolder ? (
                <div className="mt-2 inline-flex w-full items-center gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
                  {[
                    { root: false, label: `Inside ${selectedFolder.name}` },
                    { root: true, label: 'Top level' },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={newFolderAtRoot === option.root}
                      onClick={() => setNewFolderAtRoot(option.root)}
                      className={cn(
                        'anim-press min-w-0 flex-1 truncate rounded-full px-2 py-1 text-[11.5px] font-semibold transition-colors',
                        newFolderAtRoot === option.root
                          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[11.5px] text-[var(--color-text-muted)]">inside Notes</p>
              )}

              <div className="mt-2 flex justify-end">
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || creatingFolder}
                >
                  {creatingFolder ? 'Creating…' : 'Create folder'}
                </Button>
              </div>
            </div>
          ) : null}

          {folderList.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              No folders yet — create one to put this task in.
            </p>
          ) : (
            <div className="mt-2 max-h-52 overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2">
              <PickerBranch nodes={forest} selectedId={folderId} onSelect={setFolderId} depth={0} />
            </div>
          )}

          {isSpace ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-[var(--color-text-muted)]">Who can see it</p>
              <div
                role="radiogroup"
                aria-label="Who can see this note"
                className="mt-2 grid grid-cols-2 gap-2"
              >
                {([
                  ['space', 'Everyone', Globe],
                  ['private', 'Only me', Lock],
                ] as const).map(([level, label, Icon]) => {
                  const active = visibility === level
                  return (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={submitting}
                      onClick={() => setVisibility(level)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors',
                        active
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
                      )}
                    >
                      <Icon
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: active ? 'var(--color-accent)' : undefined }}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="subtle" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!folderId || submitting}>
              {submitting ? 'Creating…' : 'Create task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
