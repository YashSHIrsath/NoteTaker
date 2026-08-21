import { FileSpreadsheet, FileText } from 'lucide-react'
import type { Attachment } from '../../types'
import { Button } from '../ui/Button'

export interface AttachmentItemProps {
  attachment: Attachment
  onOpen: () => void
  onRemove?: () => void
  removing?: boolean
}

function AttachmentIcon({ attachment }: { attachment: Attachment }) {
  if (
    attachment.type === 'csv' ||
    attachment.type === 'xls' ||
    attachment.type === 'xlsx'
  ) {
    return <FileSpreadsheet className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
  }
  return <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
}

export function AttachmentItem({ attachment, onOpen, onRemove, removing = false }: AttachmentItemProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
      >
        <AttachmentIcon attachment={attachment} />
        <span className="truncate">{attachment.name}</span>
      </button>
      <Button variant="subtle" size="sm" onClick={onOpen}>
        Open
      </Button>
      {onRemove ? (
        <Button variant="subtle" size="sm" onClick={onRemove} disabled={removing}>
          {removing ? 'Removing…' : 'Remove'}
        </Button>
      ) : null}
    </div>
  )
}
