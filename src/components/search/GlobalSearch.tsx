import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SearchInput } from './SearchInput'
import { SearchResults } from './SearchResults'
import { useFolders } from '../../hooks/useFolders'
import { collectSubtaskAncestorIds } from '../../lib/subtasks'
import { searchNotes, type SearchResult } from '../../services/search/searchNotes'
import { cn } from '../../lib/cn'

export interface GlobalSearchProps {
  className?: string
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const navigate = useNavigate()
  const { folders, tasks, subtasks, expandSubtask } = useFolders()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(
    () => searchNotes(query, { folders, tasks, subtasks }),
    [folders, query, subtasks, tasks],
  )

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const selectResult = useCallback(
    (result: SearchResult) => {
      if (result.revealSubtaskId) {
        const ancestors = collectSubtaskAncestorIds(subtasks, result.revealSubtaskId)
        for (const ancestorId of ancestors) {
          expandSubtask(ancestorId)
        }
      }
      close()
      setQuery('')
      navigate(result.href, {
        state: result.revealSubtaskId ? { revealSubtaskId: result.revealSubtaskId } : null,
      })
    },
    [close, expandSubtask, navigate, subtasks],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [close, open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
        return
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        close()
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, open])

  const showPanel = open && query.trim().length > 0

  return (
    <div ref={rootRef} className={cn('relative min-w-0 flex-1', className)}>
      <SearchInput
        inputRef={inputRef}
        value={query}
        onChange={(value) => {
          setQuery(value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            close()
            inputRef.current?.blur()
          }
        }}
      />
      {showPanel ? (
        <div
          className={cn(
            'fixed inset-x-3 top-14 z-50 overflow-hidden rounded-md border border-[var(--color-border)]',
            'bg-[var(--color-surface)] shadow-lg',
            'sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:left-auto sm:mt-1 sm:w-[min(100%,24rem)]',
          )}
        >
          <SearchResults query={query} results={results} onSelect={selectResult} />
        </div>
      ) : null}
    </div>
  )
}
