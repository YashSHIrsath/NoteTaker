import { FileText } from 'lucide-react'
import type { Attachment } from '../../types'
import { Button } from '../ui/Button'

export interface PdfAttachmentProps {
  attachment: Attachment
  onOpen: () => void
}

export function PdfAttachment({ attachment, onOpen }: PdfAttachmentProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full px-1 py-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-1 py-1 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20"
      >
        <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        <span className="truncate">{attachment.name}</span>
      </button>
      <Button variant="subtle" size="sm" onClick={onOpen}>
        Open
      </Button>
    </div>
  )
}
