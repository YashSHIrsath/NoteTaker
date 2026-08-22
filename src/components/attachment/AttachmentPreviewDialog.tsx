import { useEffect, useRef } from 'react'
import { Download, X } from 'lucide-react'
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
      <>
        <iframe
          title={`${attachment.name} preview`}
          src={attachment.previewUrl}
          className="h-full w-full border-0 bg-[var(--color-surface)]"
        />
        {/* An Android WebView has no PDF renderer, so that iframe is simply blank there — which
            is what "I can't see PDFs" was. The header's Open button hands the file to a real PDF
            app instead; this line says so rather than leaving an empty panel unexplained. */}
        <p className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-center text-[12px] text-[var(--color-text-muted)]">
          No preview? Use Open to view this in another app.
        </p>
      </>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={attachment.name}
        tabIndex={-1}
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none',
          'pt-[env(safe-area-inset-top)] sm:h-auto sm:max-w-3xl sm:rounded-xl sm:pt-0',
          // A PDF/spreadsheet viewer needs a tall scroll area to fill, but an image only needs
          // its own height — forcing 85vh on a portrait photo is what left a large empty gap
          // under it, so images size the panel to the picture instead.
          attachment.isImage ? 'sm:max-h-[90vh]' : 'sm:h-[min(85vh,800px)]',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-[var(--color-text)]">{attachment.name}</span>
          <div className="flex shrink-0 items-center gap-0.5">
            {/* A plain link, not a fetch + blob dance: the browser (or Android) already knows how
                to hand a file off, and `download` gives it the real filename instead of a blob id.
                target=_blank is what makes a WebView pass a PDF to an app that can show it. */}
            <a
              href={attachment.previewUrl}
              download={attachment.name}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${attachment.name}`}
              title="Open / download"
              className="anim-press inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
            >
              <Download className="h-4 w-4" aria-hidden />
            </a>
            <IconButton label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto">
          <AttachmentPreviewBody attachment={attachment} />
        </div>
      </div>
    </div>
  )
}
