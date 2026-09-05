import type { AttachmentType } from '../../types'
import {
  detectDocumentType,
  isAcceptedImageFile,
  isAcceptedPdfFile,
} from './types'
import { MAX_ATTACHMENT_BYTES } from './limits'

export function classifyAttachmentFile(file: File): AttachmentType {
  if (isAcceptedImageFile(file)) {
    return 'image'
  }
  if (isAcceptedPdfFile(file)) {
    return 'pdf'
  }
  // Anything with a rich preview (doc/docx/xls/xlsx/csv/md/txt) gets its specific type; everything
  // else still attaches — as a generic file with a name+icon chip and no content preview — rather
  // than being rejected. The only remaining gate is size, in assertAllowedAttachmentFile below.
  return detectDocumentType(file) ?? 'file'
}

export function assertAllowedAttachmentFile(file: File): AttachmentType {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('This file is too large.')
  }
  return classifyAttachmentFile(file)
}

export function sanitizeAttachmentFilename(name: string): string {
  const trimmed = name.trim().replaceAll('\\', '/').split('/').pop() ?? 'file'
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '')
  return safe.length > 0 ? safe.slice(0, 120) : 'file'
}

export function buildAttachmentStoragePath(
  userId: string,
  taskId: string,
  attachmentId: string,
  originalName: string,
): string {
  return `${userId}/${taskId}/${attachmentId}-${sanitizeAttachmentFilename(originalName)}`
}
