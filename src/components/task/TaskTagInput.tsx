import { useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface TaskTagInputProps {
  /** Sits inside the note's single header row, so it drops its own layout and its button label. */
  compact?: boolean
  tags: string[]
  onChange: (tags: string[]) => void
}

export function TaskTagInput({ tags, onChange, compact = false }: TaskTagInputProps) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const commit = () => {
    const value = draft.trim()
    setDraft('')
    setAdding(false)
    if (!value || tags.includes(value)) {
      return
    }
    onChange([...tags, value])
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft('')
      setAdding(false)
    }
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((item) => item !== tag))
  }

  return (
    // Compact: no row of its own — the tags and the add button are items in the header row that
    // owns the layout. Full: tags left, the add control pinned to the opposite end so it doesn't
    // shuffle rightward every time a tag is added.
    <div className={cn('flex items-center gap-1.5', compact ? 'min-w-0' : 'justify-between gap-2')}>
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
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag ${tag}`}
              className="shrink-0 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>

      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder="Tag name"
          className="w-24 shrink-0 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-text)] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Add tag"
          title="Add tag"
          className={cn(
            'anim-press inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--color-border)] py-0.5 text-[11px] font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
            compact ? 'px-1.5' : 'px-2',
          )}
        >
          <Plus className="h-3 w-3" aria-hidden />
          {compact ? null : 'Tag'}
        </button>
      )}
    </div>
  )
}
