import { MAX_ATTACHMENT_BYTES } from './limits'
import {
  assertAllowedAttachmentFile,
  buildAttachmentStoragePath,
  classifyAttachmentFile,
  sanitizeAttachmentFilename,
} from './storagePath'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function fakeFile(name: string, type: string, size = 12): File {
  const bytes = new Uint8Array(size)
  return new File([bytes], name, { type })
}

export function runAttachmentStorageChecks(): void {
  const png = fakeFile('photo.png', 'image/png')
  const pdf = fakeFile('spec.pdf', 'application/pdf')
  const csv = fakeFile('data.csv', 'text/csv')
  const xlsx = fakeFile(
    'sheet.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  const docx = fakeFile(
    'note.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  const mp4 = fakeFile('clip.mp4', 'video/mp4')
  const tooBig = fakeFile('huge.png', 'image/png', MAX_ATTACHMENT_BYTES + 1)

  assert(classifyAttachmentFile(png) === 'image', 'png is image')
  assert(classifyAttachmentFile(pdf) === 'pdf', 'pdf is pdf')
  assert(classifyAttachmentFile(csv) === 'csv', 'csv is csv')
  assert(classifyAttachmentFile(xlsx) === 'xlsx', 'xlsx is spreadsheet')
  assert(classifyAttachmentFile(docx) === 'docx', 'docx is document')
  assert(classifyAttachmentFile(mp4) === null, 'video is rejected')

  assert(assertAllowedAttachmentFile(png) === 'image', 'png allowed')
  let oversized = false
  try {
    assertAllowedAttachmentFile(tooBig)
  } catch {
    oversized = true
  }
  assert(oversized, 'oversized files are rejected')

  assert(sanitizeAttachmentFilename('../../secret.pdf') === 'secret.pdf', 'path segments stripped')
  const sanitized = sanitizeAttachmentFilename('My File (1).PDF')
  assert(!sanitized.includes(' ') && !sanitized.includes('/'), 'filename sanitized')

  const path = buildAttachmentStoragePath(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'Quarter Report.pdf',
  )
  assert(
    path ===
      '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333-Quarter_Report.pdf',
    'storage path is user/task/id-filename',
  )
  assert(!path.includes('..'), 'storage path has no parent segments')
}
