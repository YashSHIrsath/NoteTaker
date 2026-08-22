import { BlockNoteEditor } from '@blocknote/core'
import type { Attachment, Subtask } from '../types'
import { attachmentIdFromUrl, buildInitialBlocks, type StoredBlock } from './blockNoteContent'

export type GetAttachmentFile = (attachmentId: string) => Promise<File | null> | File | null

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'Untitled'
  return trimmed.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120)
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// Blocks reference attachments as `attachment://<id>` — meaningful only inside this app, where
// `resolveFileUrl` swaps it for a live preview URL. Outside the app (a downloaded .md file, a
// separate print window) that scheme resolves to nothing, so the image renders broken. Embed
// the actual bytes as a data: URI instead — self-contained, no dependency on this session.
async function resolveAttachmentUrls(blocks: StoredBlock[], getAttachmentFile: GetAttachmentFile): Promise<StoredBlock[]> {
  const dataUrlCache = new Map<string, string>()

  const resolveOne = async (block: StoredBlock): Promise<StoredBlock> => {
    const url = typeof block.props?.url === 'string' ? block.props.url : ''
    const attachmentId = attachmentIdFromUrl(url)
    let props = block.props
    if (attachmentId) {
      let dataUrl = dataUrlCache.get(attachmentId)
      if (dataUrl === undefined) {
        const file = await getAttachmentFile(attachmentId)
        dataUrl = file ? await fileToDataUrl(file) : ''
        dataUrlCache.set(attachmentId, dataUrl)
      }
      if (dataUrl) {
        props = { ...block.props, url: dataUrl }
      }
    }
    const children = block.children ? await Promise.all(block.children.map(resolveOne)) : block.children
    return { ...block, props, children }
  }

  return Promise.all(blocks.map(resolveOne))
}

export async function downloadTaskAsMarkdown(
  title: string,
  content: string,
  attachments: Attachment[],
  subtasks: Subtask[],
  getAttachmentFile: GetAttachmentFile,
): Promise<void> {
  const blocks = await resolveAttachmentUrls(buildInitialBlocks(content, attachments, subtasks), getAttachmentFile)
  const editor = BlockNoteEditor.create({ initialContent: blocks })
  const markdown = editor.blocksToMarkdownLossy()
  const fileBody = `# ${title.trim() || 'Untitled'}\n\n${markdown}`
  const blob = new Blob([fileBody], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sanitizeFileName(title)}.md`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** "Export as PDF" without a PDF library: open a clean print-only view and hand off to the
 *  browser's native print dialog, where "Save as PDF" is a standard destination. The window
 *  opens synchronously (inside the click handler) so the popup blocker doesn't step in, then
 *  gets filled in once attachments have resolved to embeddable data URIs. */
export async function openTaskPrintView(
  title: string,
  content: string,
  attachments: Attachment[],
  subtasks: Subtask[],
  getAttachmentFile: GetAttachmentFile,
): Promise<void> {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    return
  }
  printWindow.document.write(
    '<!doctype html><title>Preparing…</title><body style="font-family:-apple-system,sans-serif;color:#888;padding:48px;">Preparing export…</body>',
  )

  const blocks = await resolveAttachmentUrls(buildInitialBlocks(content, attachments, subtasks), getAttachmentFile)
  const editor = BlockNoteEditor.create({ initialContent: blocks })
  const bodyHtml = editor.blocksToFullHTML()
  const safeTitle = escapeHtml(title.trim() || 'Untitled')

  printWindow.document.open()
  printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #14161a; max-width: 720px; margin: 40px auto; padding: 0 24px 60px; line-height: 1.6; }
  h1 { font-size: 26px; margin-bottom: 24px; }
  img { max-width: 100%; }
</style>
</head>
<body>
<h1>${safeTitle}</h1>
${bodyHtml}
</body>
</html>`)
  printWindow.document.close()
  printWindow.focus()
  printWindow.onload = () => {
    printWindow.print()
  }
}
