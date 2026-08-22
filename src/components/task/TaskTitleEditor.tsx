import { cn } from '../../lib/cn'

export interface TaskTitleEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
}

export function TaskTitleEditor({ value, onChange, className, id }: TaskTitleEditorProps) {
  return (
    <input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        if (!value.trim()) {
          onChange('Untitled')
        }
      }}
      placeholder="Untitled"
      aria-label="Task title"
      className={cn(
        'min-w-0 flex-1 bg-transparent text-[19px] font-semibold tracking-tight text-[var(--color-text)] sm:text-2xl',
        'placeholder:text-[var(--color-text-muted)]',
        'outline-none',
        className,
      )}
    />
  )
}
