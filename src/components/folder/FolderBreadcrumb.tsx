import { FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Folder } from '../../types'
import { cn } from '../../lib/cn'

export interface FolderBreadcrumbProps {
  path: Folder[]
  currentLabel?: string
  /** Renders currentLabel as a file chip instead of a plain crumb, so a task doesn't read as another folder in the chain. */
  currentIsTask?: boolean
}

export function FolderBreadcrumb({ path, currentLabel, currentIsTask = false }: FolderBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="text-[11.5px] text-[var(--color-text-muted)] sm:text-[13px]">
      <ol className="flex flex-wrap items-center gap-1">
        <li className="flex items-center gap-1">
          <Link
            to="/mynotes"
            className="rounded-sm hover:text-[var(--color-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
          >
            Notes
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
          <li className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden>→</span>
            {currentIsTask ? (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] px-2 py-0.5 text-[var(--color-text)]">
                <FileText className="h-3 w-3 shrink-0" aria-hidden />
                <span className="max-w-[9rem] truncate font-medium">{currentLabel}</span>
              </span>
            ) : (
              <span className="max-w-[9rem] truncate text-[var(--color-text)]">{currentLabel}</span>
            )}
          </li>
        ) : null}
      </ol>
    </nav>
  )
}
