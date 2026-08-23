import type { KeyboardEvent, Ref } from 'react'
import { Search } from 'lucide-react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { cn } from '../../lib/cn'

/** Below `sm` the long hint doesn't fit and truncated mid-word ("Search or run a com"), which
 *  reads as a bug rather than as a hint. Swapped for the short one rather than clipped. */
const NARROW_QUERY = '(max-width: 639px)'

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  inputRef?: Ref<HTMLInputElement>
  id?: string
}

export function SearchInput({
  value,
  onChange,
  onFocus,
  onKeyDown,
  inputRef,
  id = 'global-search-input',
}: SearchInputProps) {
  const narrow = useMediaQuery(NARROW_QUERY)

  return (
    <label className="relative block min-w-0 flex-1">
      <span className="absolute -left-[9999px] h-px w-px overflow-hidden">Search notes</span>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
        aria-hidden
      />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        placeholder={narrow ? 'Search' : 'Search or run a command...'}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        className={cn(
          'h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]',
          'pl-8 pr-3 text-sm text-[var(--color-text)] outline-none',
          'placeholder:text-[var(--color-text-muted)]',
          'focus:ring-2 focus:ring-[var(--color-accent)]/20',
        )}
      />
    </label>
  )
}
