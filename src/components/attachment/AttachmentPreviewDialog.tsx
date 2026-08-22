import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { Attachment } from '../../types'
import { cn } from '../../lib/cn'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { IconButton } from '../ui/IconButton'
import { ImagePreview } from './ImagePreview'
import { DocumentPreview } from './DocumentPreview'
import { CsvPreview } from './CsvPreview'
import { ExcelPreview } from './ExcelPreview'

export interface AttachmentPreviewDialogProps {
  attachment: Attachment | null
  onClose: () => void
}

function AttachmentPreviewBody({ attachment }: { attachment: Attachment }) {
  if (attachment.isImage) {
    return <ImagePreview src={attachment.previewUrl} alt={attachment.name} />
  }
  if (attachment.isPdf) {
    return (
      <iframe
        title={`${attachment.name} preview`}
        src={attachment.previewUrl}
        className="h-full w-full border-0 bg-[var(--color-surface)]"
      />
    )
  }
  if (attachment.type === 'csv') {
    return <CsvPreview attachment={attachment} />
  }
  if (attachment.type === 'xls' || attachment.type === 'xlsx') {
    return <ExcelPreview attachment={attachment} />
  }
  return <DocumentPreview attachment={attachment} />
}

export function AttachmentPreviewDialog({ attachment, onClose }: AttachmentPreviewDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const open = attachment !== null

  useDialogFocus(open, panelRef)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!attachment) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={attachment.name}
        tabIndex={-1}
        className={cn(
          'relative flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none',
          // A PDF/spreadsheet viewer needs a tall scroll area to fill, but an image only needs
          // its own height — forcing 85vh on a portrait photo is what left a large empty gap
          // under it, so images size the panel to the picture instead.
          attachment.isImage ? 'max-h-[90vh]' : 'h-[min(85vh,800px)]',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-[var(--color-text)]">{attachment.name}</span>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <AttachmentPreviewBody attachment={attachment} />
        </div>
      </div>
    </div>
  )
}
