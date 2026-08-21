import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

const rowClassName =
  'flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20'

export interface SidebarSectionProps {
  icon: ReactNode
  label: string
  active?: boolean
  onSelect?: () => void
  expandable?: boolean
  expanded?: boolean
  onToggleExpand?: () => void
  children?: ReactNode
}

export function SidebarSection({
  icon,
  label,
  active = false,
  onSelect,
  expandable = false,
  expanded = false,
  onToggleExpand,
  children,
}: SidebarSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-0.5">
        {expandable ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            aria-expanded={expanded}
            onClick={onToggleExpand}
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              'text-[var(--color-text-muted)] transition-colors',
              'hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
            )}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : (
          <span className="inline-flex h-7 w-7 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          onClick={onSelect}
          className={cn(
            rowClassName,
            active
              ? 'bg-[var(--color-hover)] font-medium text-[var(--color-text)]'
              : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
          )}
        >
          <span className="shrink-0 text-[var(--color-text-muted)]">{icon}</span>
          <span className="truncate">{label}</span>
        </button>
      </div>

      {expandable && expanded && children ? (
        <div className="ml-[1.75rem] mt-0.5 space-y-0.5 border-l border-[var(--color-border)] pl-2">
          {children}
        </div>
      ) : null}
    </div>
  )
}
