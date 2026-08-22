import { FileSpreadsheet, FileText, Image as ImageIcon } from 'lucide-react'
import type { Attachment } from '../../types'

export interface AttachmentTypeIconProps {
  attachment: Attachment
  className?: string
}

export function AttachmentTypeIcon({ attachment, className = 'h-3.5 w-3.5 shrink-0' }: AttachmentTypeIconProps) {
  if (attachment.isImage) {
    return <ImageIcon className={className} aria-hidden />
  }
  if (attachment.type === 'csv' || attachment.type === 'xls' || attachment.type === 'xlsx') {
    return <FileSpreadsheet className={className} aria-hidden />
  }
  return <FileText className={className} aria-hidden />
}

/** Images first, then PDFs, then everything else — the order an attachments bar groups by. */
export function attachmentSortRank(attachment: Attachment): number {
  if (attachment.isImage) return 0
  if (attachment.isPdf) return 1
  return 2
}
