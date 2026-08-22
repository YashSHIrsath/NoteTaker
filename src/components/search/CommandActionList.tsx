import type { ReactNode } from 'react'

export interface CommandAction {
  id: string
  label: string
  icon: ReactNode
  run: () => void
}

export interface CommandActionListProps {
  actions: CommandAction[]
}

export function CommandActionList({ actions }: CommandActionListProps) {
  if (actions.length === 0) {
    return null
  }
  return (
    <ul role="listbox" aria-label="Commands" className="border-b border-[var(--color-border)] py-1">
      {actions.map((action) => (
        <li key={action.id}>
          <button
            type="button"
            role="option"
            onClick={action.run}
            className="flex w-full items-center gap-2.5 rounded-full px-2.5 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
          >
            <span className="shrink-0 text-[var(--color-text-muted)]">{action.icon}</span>
            <span className="min-w-0 flex-1 truncate">{action.label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
