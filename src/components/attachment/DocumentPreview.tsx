import { useEffect, useState } from 'react'
import mammoth from 'mammoth'
import { useFolders } from '../../hooks/useFolders'
import type { Attachment } from '../../types'
import { PreviewStatus } from './SpreadsheetTable'
import { Spinner } from '../ui/Spinner'

export interface DocumentPreviewProps {
  attachment: Attachment
}

const PREVIEW_STYLES = `
  body { margin: 16px; font: 14px/1.6 system-ui, sans-serif; color: #1a1a18; }
  h1, h2, h3, h4 { margin: 1em 0 0.4em; font-weight: 600; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.2rem; }
  h3 { font-size: 1.05rem; }
  p { margin: 0.6em 0; }
  ul, ol { margin: 0.6em 0; padding-left: 1.4em; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
  td, th { border: 1px solid #e8e8e5; padding: 6px 8px; text-align: left; }
`

export function DocumentPreview({ attachment }: DocumentPreviewProps) {
  const { getAttachmentFile } = useFolders()
  const [html, setHtml] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.resolve(getAttachmentFile(attachment.id)).then((file) => {
      if (cancelled) {
        return
      }
      if (!file) {
        setError('This document is no longer available.')
        return
      }

      if (attachment.type === 'doc') {
        setError(
          'Legacy .doc files cannot be previewed reliably in the browser. Use Open to view or download the file.',
        )
        return
      }

      file
        .arrayBuffer()
        .then((buffer: ArrayBuffer) => mammoth.convertToHtml({ arrayBuffer: buffer }))
        .then((result: { value: string }) => {
          if (!cancelled) {
            setHtml(result.value)
            setError(null)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError('This document could not be previewed. Use Open to view or download the file.')
          }
        })
    })

    return () => {
      cancelled = true
    }
  }, [attachment.id, attachment.type, getAttachmentFile])

  if (error) {
    return <PreviewStatus>{error}</PreviewStatus>
  }

  if (!html) {
    return (
      <PreviewStatus>
        <span className="inline-flex items-center gap-2">
          <Spinner />
          Loading preview…
        </span>
      </PreviewStatus>
    )
  }

  return (
    <iframe
      title={`${attachment.name} preview`}
      sandbox="allow-same-origin"
      srcDoc={`<!doctype html><html><head><meta charset="utf-8" /><style>${PREVIEW_STYLES}</style></head><body>${html}</body></html>`}
      className="h-full w-full border-0 bg-[var(--color-surface)]"
    />
  )
}
