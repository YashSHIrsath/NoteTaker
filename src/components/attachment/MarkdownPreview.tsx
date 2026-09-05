import { useEffect, useState } from 'react'
import { marked } from 'marked'
import { useFolders } from '../../hooks/useFolders'
import type { Attachment } from '../../types'
import { PreviewStatus } from './SpreadsheetTable'
import { Spinner } from '../ui/Spinner'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'

export interface MarkdownPreviewProps {
  attachment: Attachment
}

/** Rendered, not raw — headings, lists, links and tables read as themselves instead of as
 *  literal `#`/`-`/`|` characters. Same iframe-based renderer as DocumentPreview's .docx
 *  preview, just fed marked's HTML instead of mammoth's. */
export function MarkdownPreview({ attachment }: MarkdownPreviewProps) {
  const { getAttachmentFile } = useFolders()
  const [html, setHtml] = useState<string | null>(null)
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
        .then((markdown: string) => {
          if (cancelled) {
            return
          }
          setHtml(marked.parse(markdown, { async: false }))
          setError(null)
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

  if (html === null) {
    return (
      <PreviewStatus>
        <span className="inline-flex items-center gap-2">
          <Spinner />
          Loading preview…
        </span>
      </PreviewStatus>
    )
  }

  return <HtmlPreviewFrame title={attachment.name} html={html} />
}
