import { cn } from '../../lib/cn'

export interface NoteEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function NoteEditor({ value, onChange, className }: NoteEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Start writing..."
      aria-label="Note content"
      rows={10}
      className={cn(
        'min-h-[200px] w-full resize-y bg-transparent py-1',
        'text-base leading-7 text-[var(--color-text)]',
        'placeholder:text-[var(--color-text-muted)]',
        'outline-none',
        className,
      )}
    />
  )
}
