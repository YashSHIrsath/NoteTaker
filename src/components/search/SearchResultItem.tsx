import { CheckSquare, FileText, Folder } from 'lucide-react'
import type { SearchResult } from '../../services/search/searchNotes'
import { cn } from '../../lib/cn'

export interface SearchResultItemProps {
  result: SearchResult
  onSelect: (result: SearchResult) => void
}

function ResultIcon({ kind }: { kind: SearchResult['kind'] }) {
  if (kind === 'folder') {
    return <Folder className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
  }
  if (kind === 'task') {
    return <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
  }
  return <CheckSquare className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
}

function kindLabel(kind: SearchResult['kind']): string {
  if (kind === 'folder') {
    return 'Folder'
  }
  if (kind === 'task') {
    return 'Task'
  }
  return 'Subtask'
}

export function SearchResultItem({ result, onSelect }: SearchResultItemProps) {
  return (
    <button
      type="button"
      role="option"
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left',
        'hover:bg-[var(--color-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
      )}
      onClick={() => onSelect(result)}
    >
      <ResultIcon kind={result.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--color-text)]">
          {result.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
          {result.pathLabel || kindLabel(result.kind)}
        </span>
      </span>
    </button>
  )
}
