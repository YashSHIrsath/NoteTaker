import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Attachment } from '../../types'
import { Button } from '../ui/Button'
import { ImageAttachment } from './ImageAttachment'
import { AttachmentItem } from './AttachmentItem'
import { PdfPreviewDialog } from './PdfPreviewDialog'
import { DocumentPreviewDialog } from './DocumentPreviewDialog'
import {
  ACCEPTED_DOCUMENT_ACCEPT,
  ACCEPTED_IMAGE_ACCEPT,
  ACCEPTED_PDF_ACCEPT,
} from '../../services/attachments'

export interface AttachmentListProps {
  attachments: Attachment[]
  expandedIds: ReadonlySet<string>
  onToggleExpanded: (attachmentId: string) => void
  onAddImage?: (file: File) => void
  onAddPdf?: (file: File) => void
  onAddDocument?: (file: File) => void
  onRemove?: (attachmentId: string) => void
  busy?: boolean
  removingId?: string | null
}

export function AttachmentList({
  attachments,
  expandedIds,
  onToggleExpanded,
  onAddImage,
  onAddPdf,
  onAddDocument,
  onRemove,
  busy = false,
  removingId = null,
}: AttachmentListProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const [selectedPdf, setSelectedPdf] = useState<Attachment | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<Attachment | null>(null)
  const showAddActions = Boolean(onAddImage || onAddPdf || onAddDocument)

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Attachments
        </h2>
        {showAddActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {onAddImage ? (
              <>
                <Button variant="subtle" size="sm" disabled={busy} onClick={() => imageInputRef.current?.click()}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Image
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_ACCEPT}
                  className="hidden"
                  aria-label="Add image"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) {
                      onAddImage(file)
                    }
                  }}
                />
              </>
            ) : null}
            {onAddPdf ? (
              <>
                <Button variant="subtle" size="sm" disabled={busy} onClick={() => pdfInputRef.current?.click()}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add PDF
                </Button>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept={ACCEPTED_PDF_ACCEPT}
                  className="hidden"
                  aria-label="Add PDF"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) {
                      onAddPdf(file)
                    }
                  }}
                />
              </>
            ) : null}
            {onAddDocument ? (
              <>
                <Button variant="subtle" size="sm" disabled={busy} onClick={() => documentInputRef.current?.click()}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Document
                </Button>
                <input
                  ref={documentInputRef}
                  type="file"
                  accept={ACCEPTED_DOCUMENT_ACCEPT}
                  className="hidden"
                  aria-label="Add document"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) {
                      onAddDocument(file)
                    }
                  }}
                />
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        {attachments.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No attachments</p>
        ) : (
          <ul className="space-y-1">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                {attachment.isImage ? (
                  <ImageAttachment
                    attachment={attachment}
                    expanded={expandedIds.has(attachment.id)}
                    onToggleExpanded={() => onToggleExpanded(attachment.id)}
                    onRemove={onRemove && !busy ? () => onRemove(attachment.id) : undefined}
                    removing={removingId === attachment.id}
                  />
                ) : attachment.isPdf ? (
                  <AttachmentItem
                    attachment={attachment}
                    onOpen={() => setSelectedPdf(attachment)}
                    onRemove={onRemove && !busy ? () => onRemove(attachment.id) : undefined}
                    removing={removingId === attachment.id}
                  />
                ) : attachment.isDocument ? (
                  <AttachmentItem
                    attachment={attachment}
                    onOpen={() => setSelectedDocument(attachment)}
                    onRemove={onRemove && !busy ? () => onRemove(attachment.id) : undefined}
                    removing={removingId === attachment.id}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PdfPreviewDialog attachment={selectedPdf} onClose={() => setSelectedPdf(null)} />
      <DocumentPreviewDialog
        attachment={selectedDocument}
        onClose={() => setSelectedDocument(null)}
      />
    </section>
  )
}
