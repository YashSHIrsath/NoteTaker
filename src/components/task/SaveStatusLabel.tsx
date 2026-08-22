export type SaveStatus = 'idle' | 'saving' | 'saved'

export interface SaveStatusLabelProps {
  status: SaveStatus
}

export function SaveStatusLabel({ status }: SaveStatusLabelProps) {
  if (status === 'idle') {
    return null
  }

  return (
    <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">
      {status === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}
