import type { Attachment, AttachmentType } from '../../types'

export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const ACCEPTED_IMAGE_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'

export const ACCEPTED_PDF_MIME_TYPE = 'application/pdf'
export const ACCEPTED_PDF_ACCEPT = 'application/pdf,.pdf'

export const ACCEPTED_DOCUMENT_ACCEPT = [
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
].join(',')

const DOCUMENT_MIME_TO_TYPE: Record<string, AttachmentType> = {
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'text/comma-separated-values': 'csv',
}

export function isAcceptedImageFile(file: File): boolean {
  if (ACCEPTED_IMAGE_MIME_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number])) {
    return true
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

export function isAcceptedPdfFile(file: File): boolean {
  if (file.type === ACCEPTED_PDF_MIME_TYPE) {
    return true
  }
  return /\.pdf$/i.test(file.name)
}

export function detectDocumentType(file: File): Extract<AttachmentType, 'doc' | 'docx' | 'xls' | 'xlsx' | 'csv'> | null {
  const mime = file.type.toLowerCase()
  if (mime && DOCUMENT_MIME_TO_TYPE[mime]) {
    const detected = DOCUMENT_MIME_TO_TYPE[mime]
    if (detected === 'doc' || detected === 'docx' || detected === 'xls' || detected === 'xlsx' || detected === 'csv') {
      return detected
    }
  }

  const match = file.name.match(/\.(docx?|xlsx?|csv)$/i)
  if (!match) {
    return null
  }

  const extension = match[1].toLowerCase()
  if (extension === 'doc' || extension === 'docx' || extension === 'xls' || extension === 'xlsx' || extension === 'csv') {
    return extension
  }
  return null
}

export function isAcceptedDocumentFile(file: File): boolean {
  return detectDocumentType(file) !== null
}

export function defaultMimeForType(type: AttachmentType): string {
  switch (type) {
    case 'image':
      return 'image/jpeg'
    case 'pdf':
      return 'application/pdf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xls':
      return 'application/vnd.ms-excel'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'csv':
      return 'text/csv'
  }
}

/** Browser-session file store. Replace with cloud storage later. */
export interface AttachmentStore {
  storeFile(file: File): { id: string; previewUrl: string }
  getPreviewUrl(id: string): string | null
  getFile(id: string): File | null
}

export type { Attachment }
