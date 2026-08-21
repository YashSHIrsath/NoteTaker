import type { AttachmentType } from '../../types'
import {
  detectDocumentType,
  isAcceptedImageFile,
  isAcceptedPdfFile,
} from './types'
import { MAX_ATTACHMENT_BYTES } from './limits'

export function classifyAttachmentFile(file: File): AttachmentType | null {
  if (isAcceptedImageFile(file)) {
    return 'image'
  }
  if (isAcceptedPdfFile(file)) {
    return 'pdf'
  }
  return detectDocumentType(file)
}

export function assertAllowedAttachmentFile(file: File): AttachmentType {
  const type = classifyAttachmentFile(file)
  if (!type) {
    throw new Error('This file type is not supported.')
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('This file is too large.')
  }
  return type
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
