import { FolderTree } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  title?: string
  description?: string
  className?: string
}

export function EmptyState({
  title = 'Mindstack',
  description = 'Select something from the sidebar to get started.',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[280px] flex-col items-center justify-center px-6 py-16 text-center',
        className,
      )}
    >
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <FolderTree className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text)]">
        {title}
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)]">
        {description}
      </p>
    </div>
  )
}
