import { useEffect, useState } from 'react'
import Papa from 'papaparse'
import { useFolders } from '../../hooks/useFolders'
import type { Attachment } from '../../types'
import { PreviewStatus, SpreadsheetTable } from './SpreadsheetTable'

export interface CsvPreviewProps {
  attachment: Attachment
}

export function CsvPreview({ attachment }: CsvPreviewProps) {
  const { getAttachmentFile } = useFolders()
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.resolve(getAttachmentFile(attachment.id)).then((file) => {
      if (cancelled) {
        return
      }
      if (!file) {
        setError('This CSV is no longer available.')
        return
      }

      file
        .text()
        .then((text: string) => {
          if (cancelled) {
            return
          }
          const parsed = Papa.parse<string[]>(text, {
            skipEmptyLines: true,
          })
          const data = parsed.data.filter((row) => row.some((cell) => String(cell).trim() !== ''))
          if (data.length === 0) {
            setHeaders([])
            setRows([])
            return
          }
          setHeaders(data[0].map((cell) => String(cell ?? '')))
          setRows(data.slice(1).map((row) => row.map((cell) => String(cell ?? ''))))
          setError(null)
        })
        .catch(() => {
          if (!cancelled) {
            setError('This CSV could not be previewed.')
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

  return <SpreadsheetTable headers={headers} rows={rows} />
}
