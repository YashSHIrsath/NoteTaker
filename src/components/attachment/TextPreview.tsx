import { useEffect, useState } from 'react'
import { useFolders } from '../../hooks/useFolders'
import type { Attachment } from '../../types'
import { PreviewStatus } from './SpreadsheetTable'
import { Spinner } from '../ui/Spinner'

export interface TextPreviewProps {
  attachment: Attachment
}

/** Plain-text rendering for .txt attachments — monospace, as-written. Markdown gets its own
 *  rendered preview instead (see MarkdownPreview); plain text has no syntax to render. */
export function TextPreview({ attachment }: TextPreviewProps) {
  const { getAttachmentFile } = useFolders()
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.resolve(getAttachmentFile(attachment.id)).then((file) => {
      if (cancelled) {
        return
      }
      if (!file) {
        setError('This file is no longer available.')
        return
      }

      file
        .text()
        .then((value: string) => {
          if (!cancelled) {
            setText(value)
            setError(null)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError('This file could not be previewed.')
          }
        })
    })

    return () => {
      cancelled = true
    }
  }, [attachment.id, getAttachmentFile])

  if (error) {
    return <PreviewStatus>{error}</PreviewStatus>
  }

  if (text === null) {
    return (
      <PreviewStatus>
        <span className="inline-flex items-center gap-2">
          <Spinner />
          Loading preview…
        </span>
      </PreviewStatus>
    )
  }

  if (text.trim() === '') {
    return <PreviewStatus>This file is empty.</PreviewStatus>
  }

  return (
    <pre className="h-full min-h-0 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-relaxed text-[var(--color-text)]">
      {text}
    </pre>
  )
}
