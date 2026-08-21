import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import type { Attachment } from '../../types'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface PdfPreviewDialogProps {
  attachment: Attachment | null
  onClose: () => void
}

export function PdfPreviewDialog({ attachment, onClose }: PdfPreviewDialogProps) {
  const headingId = useId()
  const open = attachment !== null && attachment.isPdf
  const panelRef = useRef<HTMLDivElement>(null)

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

  if (!open || !attachment) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="relative flex h-[min(80vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg outline-none"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <h2
            id={headingId}
            className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--color-text)]"
          >
            {attachment.name}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 bg-[var(--color-surface-muted)]">
          <iframe
            title={attachment.name}
            src={attachment.previewUrl}
            className="h-full w-full border-0"
          />
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.open(attachment.previewUrl, '_blank', 'noopener,noreferrer')}
          >
            Open
          </Button>
        </div>
      </div>
    </div>
  )
}
