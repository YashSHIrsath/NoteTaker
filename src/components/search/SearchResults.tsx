import type { SearchResult } from '../../services/search/searchNotes'
import { SearchResultItem } from './SearchResultItem'

export interface SearchResultsProps {
  query: string
  results: SearchResult[]
  onSelect: (result: SearchResult) => void
}

export function SearchResults({ query, results, onSelect }: SearchResultsProps) {
  if (!query.trim()) {
    return null
  }

  if (results.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">
        No results found.
      </p>
    )
  }

  return (
    <ul role="listbox" aria-label="Search results" className="max-h-80 overflow-y-auto py-1">
      {results.map((result) => (
        <li key={`${result.kind}:${result.id}`}>
          <SearchResultItem result={result} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  )
}
