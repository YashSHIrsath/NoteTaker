import { Trash2 } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { cn } from '../../lib/cn'

export interface RowDeleteButtonProps {
  label: string
  onClick: () => void
  compact?: boolean
}

export function RowDeleteButton({ label, onClick, compact = false }: RowDeleteButtonProps) {
  return (
    <IconButton
      label={label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      className={cn(compact ? 'h-6 w-6' : 'h-7 w-7')}
    >
      <Trash2 className="h-4 w-4" aria-hidden />
    </IconButton>
  )
}
