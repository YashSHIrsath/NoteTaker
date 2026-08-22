import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { useFolders } from '../../hooks/useFolders'
import type { Attachment } from '../../types'
import { cn } from '../../lib/cn'
import { PreviewStatus, SpreadsheetTable } from './SpreadsheetTable'

export interface ExcelPreviewProps {
  attachment: Attachment
}

function sheetToTable(workbook: XLSX.WorkBook, sheetName: string): { headers: string[]; rows: string[][] } {
  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })
  if (matrix.length === 0) {
    return { headers: [], rows: [] }
  }
  const headers = matrix[0].map((cell) => String(cell ?? ''))
  const rows = matrix.slice(1).map((row) => row.map((cell) => String(cell ?? '')))
  return { headers, rows }
}

export function ExcelPreview({ attachment }: ExcelPreviewProps) {
  const { getAttachmentFile } = useFolders()
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState('')
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
        setError('This spreadsheet is no longer available.')
        return
      }

      file
        .arrayBuffer()
        .then((buffer: ArrayBuffer) => {
          if (cancelled) {
            return
          }
          const parsed = XLSX.read(buffer, { type: 'array' })
          const names = parsed.SheetNames
          if (names.length === 0) {
            setError('This workbook has no sheets to preview.')
            return
          }
          const first = names[0]
          const table = sheetToTable(parsed, first)
          setWorkbook(parsed)
          setSheetNames(names)
          setActiveSheet(first)
          setHeaders(table.headers)
          setRows(table.rows)
          setError(null)
        })
        .catch(() => {
          if (!cancelled) {
            setError('This spreadsheet could not be previewed.')
          }
        })
    })

    return () => {
      cancelled = true
    }
  }, [attachment.id, getAttachmentFile])

  const handleSelectSheet = (sheetName: string) => {
    if (!workbook) {
      return
    }
    const table = sheetToTable(workbook, sheetName)
    setActiveSheet(sheetName)
    setHeaders(table.headers)
    setRows(table.rows)
  }

  if (error) {
    return <PreviewStatus>{error}</PreviewStatus>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {sheetNames.length > 1 ? (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--color-border)] px-3 py-2">
          {sheetNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => handleSelectSheet(name)}
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-sm',
                name === activeSheet
                  ? 'bg-[var(--color-hover)] font-medium text-[var(--color-text)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              )}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <SpreadsheetTable headers={headers} rows={rows} />
      </div>
    </div>
  )
}
