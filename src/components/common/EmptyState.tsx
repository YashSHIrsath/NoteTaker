import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  title?: string
  description?: string
  className?: string
}

export function EmptyState({
  title = 'MyNotes',
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
      <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
        {title}
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-text-muted)]">
        {description}
      </p>
    </div>
  )
}
