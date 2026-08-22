import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Printer } from 'lucide-react'
import type { Attachment, Subtask } from '../../types'
import { IconButton } from '../ui/IconButton'
import { downloadTaskAsMarkdown, openTaskPrintView, type GetAttachmentFile } from '../../lib/exportTask'

export interface TaskExportMenuProps {
  title: string
  content: string
  attachments: Attachment[]
  subtasks: Subtask[]
  getAttachmentFile: GetAttachmentFile
}

export function TaskExportMenu({ title, content, attachments, subtasks, getAttachmentFile }: TaskExportMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <IconButton
        label="Export task"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        <Download className="h-4 w-4" aria-hidden />
      </IconButton>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-1 min-w-[10.5rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
            onClick={() => {
              setOpen(false)
              void downloadTaskAsMarkdown(title, content, attachments, subtasks, getAttachmentFile)
            }}
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            Markdown (.md)
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
            onClick={() => {
              setOpen(false)
              void openTaskPrintView(title, content, attachments, subtasks, getAttachmentFile)
            }}
          >
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
            PDF (print)
          </button>
        </div>
      ) : null}
    </div>
  )
}
