import { Link } from 'react-router-dom'
import type { Folder } from '../../types'
import { cn } from '../../lib/cn'

export interface FolderBreadcrumbProps {
  path: Folder[]
  currentLabel?: string
}

export function FolderBreadcrumb({ path, currentLabel }: FolderBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-text-muted)]">
      <ol className="flex flex-wrap items-center gap-1">
        <li className="flex items-center gap-1">
          <Link
            to="/"
            className="rounded-sm hover:text-[var(--color-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
          >
            MyNotes
          </Link>
        </li>
        {path.map((folder) => (
          <li key={folder.id} className="flex min-w-0 items-center gap-1">
            <span aria-hidden>→</span>
            <Link
              to={`/folder/${folder.id}`}
              className={cn(
                'max-w-[9rem] truncate rounded-sm hover:text-[var(--color-text)] hover:underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
              )}
            >
              {folder.name}
            </Link>
          </li>
        ))}
        {currentLabel ? (
          <li className="flex min-w-0 items-center gap-1">
            <span aria-hidden>→</span>
            <span className="max-w-[9rem] truncate text-[var(--color-text)]">{currentLabel}</span>
          </li>
        ) : null}
      </ol>
    </nav>
  )
}
