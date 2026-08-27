import { UNTITLED } from '../../lib/persistGuard'
import { cn } from '../../lib/cn'

export interface TaskTitleEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
  /** Reading mode: the title is shown, not typed into. */
  readOnly?: boolean
}

export function TaskTitleEditor({ value, onChange, className, id, readOnly = false }: TaskTitleEditorProps) {
  return (
    <input
      id={id}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
      // Leaving the field blank settles it to the placeholder, so the field and the saved row
      // agree the moment you step away. Nothing is written *while* you are still in it — clearing
      // a title in order to type a new one is the normal way to rename something, and the note is
      // safe in the meantime because snapshotFromParts substitutes the same word on the way out.
      onBlur={() => {
        if (!readOnly && !value.trim()) {
          onChange(UNTITLED)
        }
      }}
      placeholder={UNTITLED}
      aria-label="Task title"
      className={cn(
        readOnly && 'cursor-default select-text',
        'min-w-0 flex-1 bg-transparent text-[19px] font-semibold tracking-tight text-[var(--color-text)] sm:text-2xl',
        'placeholder:text-[var(--color-text-muted)]',
        'outline-none',
        className,
      )}
    />
  )
}
