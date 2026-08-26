import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useFolders } from '../../hooks/useFolders'
import { useDeleteConfirmation } from '../../hooks/useDeleteConfirmation'

export interface TaskTagInputProps {
  /** Sits inside the note's single header row, so it drops its own layout and its button label. */
  compact?: boolean
  tags: string[]
  onChange: (tags: string[]) => void
  /** Reading mode: the tags are still shown, but there is nothing to add or remove with. */
  readOnly?: boolean
}

/**
 * The tags on one note, and the way you put them there.
 *
 * The "+" opens the account's whole tag catalogue rather than an empty text field. That is the
 * difference between a tag and a typed string: before, adding "Job" to a fortieth task meant
 * typing it a fortieth time, and one slip made a second tag that looked identical in every list
 * but matched nothing. Typing still works — it filters the list, and offers to make a new tag
 * only once nothing in the list matches.
 */
export function TaskTagInput({ tags, onChange, compact = false, readOnly = false }: TaskTagInputProps) {
  const { tags: catalogue, deleteTag } = useFolders()
  const { requestDelete, dialog: deleteDialog } = useDeleteConfirmation()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const query = draft.trim().toLowerCase()
  const selected = useMemo(() => new Set(tags.map((tag) => tag.toLowerCase())), [tags])

  const matches = useMemo(
    () =>
      catalogue
        .filter((tag) => !query || tag.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalogue, query],
  )

  // Only when nothing already answers to that name — offering "Create Job" underneath an existing
  // "Job" is how duplicate tags get made.
  const canCreate =
    query.length > 0 && !catalogue.some((tag) => tag.name.toLowerCase() === query)

  const close = () => {
    setOpen(false)
    setDraft('')
  }

  const toggle = (name: string) => {
    if (selected.has(name.toLowerCase())) {
      onChange(tags.filter((tag) => tag.toLowerCase() !== name.toLowerCase()))
    } else {
      onChange([...tags, name])
    }
    setDraft('')
  }

  const commitDraft = () => {
    const value = draft.trim()
    if (!value) {
      return
    }
    // An exact match takes the catalogue's own casing, so picking from the list and typing the
    // same name land on one tag rather than two that differ by a capital letter.
    const existing = catalogue.find((tag) => tag.name.toLowerCase() === value.toLowerCase())
    toggle(existing?.name ?? value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  // A picker that stayed open behind the note you went back to reading would be a menu floating
  // over unrelated content; anywhere outside it closes it.
  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const removeTag = (tag: string) => {
    onChange(tags.filter((item) => item !== tag))
  }

  return (
    // Compact: no row of its own — the tags and the add button are items in the header row that
    // owns the layout. Full: tags left, the add control pinned to the opposite end so it doesn't
    // shuffle rightward every time a tag is added.
    <div
      ref={rootRef}
      className={cn('relative flex items-center gap-1.5', compact ? 'min-w-0' : 'justify-between gap-2')}
    >
      <div className={cn('flex min-w-0 items-center gap-1.5', compact ? '' : 'flex-wrap')}>
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-muted)]',
              compact ? 'max-w-[6rem]' : 'max-w-[10rem]',
            )}
          >
            <span className="min-w-0 truncate">{tag}</span>
            {readOnly ? null : (
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="shrink-0 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            )}
          </span>
        ))}
      </div>

      {readOnly ? null : (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label="Add tag"
          title="Add tag"
          className={cn(
            'anim-press inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed py-0.5 text-[11px] font-medium transition-colors',
            compact ? 'px-1.5' : 'px-2',
            open
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
          )}
        >
          <Plus className="h-3 w-3" aria-hidden />
          {compact ? null : 'Tag'}
        </button>
      )}

      {open && !readOnly ? (
        <div
          className={cn(
            'absolute right-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-[var(--color-border)]',
            'bg-[var(--color-surface-raised)] shadow-[var(--shadow-lg)]',
          )}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find or create a tag"
            aria-label="Find or create a tag"
            className="w-full border-b border-[var(--color-border)] bg-transparent px-3 py-2 text-[12.5px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
          />

          <div className="max-h-56 overflow-y-auto overscroll-contain py-1">
            {matches.map((tag) => {
              const active = selected.has(tag.name.toLowerCase())
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag.name)}
                  className={cn(
                    'group/tag flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors',
                    'hover:bg-[var(--color-hover)]',
                    active ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]',
                  )}
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      active ? 'text-[var(--color-accent)]' : 'opacity-0',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {/* Deletes the tag itself, not its use here — a catalogue you can only add to
                      fills up with typos, and there is nowhere else in the app to prune it. The
                      chip's own × above removes it from this note and leaves the tag alone; these
                      two sit far enough apart, and behind a confirmation, to stay distinct. */}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Delete tag ${tag.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      requestDelete({
                        title: `Delete the tag “${tag.name}”?`,
                        description: 'It will be removed from every note that carries it.',
                        onConfirm: async () => deleteTag(tag.id),
                      })
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        requestDelete({
                          title: `Delete the tag “${tag.name}”?`,
                          description: 'It will be removed from every note that carries it.',
                          onConfirm: async () => deleteTag(tag.id),
                        })
                      }
                    }}
                    className="shrink-0 rounded-full p-0.5 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:text-[var(--color-danger)] focus-visible:opacity-100 group-hover/tag:opacity-100"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </span>
                </button>
              )
            })}

            {matches.length === 0 && !canCreate ? (
              <p className="px-3 py-2 text-[12px] text-[var(--color-text-muted)]">
                {catalogue.length === 0 ? 'No tags yet — type one to make it.' : 'No tags match.'}
              </p>
            ) : null}

            {canCreate ? (
              <button
                type="button"
                onClick={commitDraft}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-hover)]"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">Create “{draft.trim()}”</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteDialog}
    </div>
  )
}
