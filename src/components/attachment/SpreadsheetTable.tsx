import { cn } from '../../lib/cn'

export interface SpreadsheetTableProps {
  headers: string[]
  rows: string[][]
}

export function SpreadsheetTable({ headers, rows }: SpreadsheetTableProps) {
  if (headers.length === 0 && rows.length === 0) {
    return <p className="p-4 text-sm text-[var(--color-text-muted)]">This file has no table data to preview.</p>
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-[var(--color-surface-muted)]">
          <tr>
            {headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className="border border-[var(--color-border)] px-2.5 py-1.5 font-medium text-[var(--color-text)]"
              >
                <span className="block max-w-[16rem] truncate" title={header}>
                  {header || `Column ${index + 1}`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="bg-[var(--color-surface)]">
              {headers.map((_, cellIndex) => {
                const value = row[cellIndex] ?? ''
                return (
                  <td
                    key={cellIndex}
                    className="border border-[var(--color-border)] px-2.5 py-1.5 text-[var(--color-text)]"
                  >
                    <span className="block max-w-[16rem] truncate" title={value}>
                      {value}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PreviewStatus({ children, className }: { children: string; className?: string }) {
  return (
    <p className={cn('p-4 text-sm text-[var(--color-text-muted)]', className)}>{children}</p>
  )
}
