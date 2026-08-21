import { useState } from 'react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import type { Attachment, Subtask } from '../../types'
import { cn } from '../../lib/cn'
import { getChildSubtasks } from '../../lib/subtasks'
import { SubtaskList } from './SubtaskList'
import { useFolders } from '../../hooks/useFolders'
import { StarButton } from '../common/StarButton'
import { RowDeleteButton } from '../common/RowDeleteButton'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { SortableTaskRow } from './SortableTaskRow'
import { ImageAttachment } from '../attachment/ImageAttachment'
import { AttachmentItem } from '../attachment/AttachmentItem'
import { PdfPreviewDialog } from '../attachment/PdfPreviewDialog'
import { DocumentPreviewDialog } from '../attachment/DocumentPreviewDialog'

export interface TaskItemProps {
  taskId: string
  title: string
  subtasks: Subtask[]
  onOpen: () => void
  onToggleSubtask: (subtaskId: string) => void
}

export function TaskItem({
  taskId,
  title,
  subtasks,
  onOpen,
  onToggleSubtask,
}: TaskItemProps) {
  const {
    isTaskExpanded,
    toggleTaskExpanded,
    isSubtaskExpanded,
    toggleSubtaskExpanded,
    getTask,
    toggleTaskImportant,
    getAttachmentsForTask,
    toggleAttachmentExpanded,
    isAttachmentExpanded,
  } = useFolders()
  const { requestTaskDelete, dialog } = useDeleteTask()
  const task = getTask(taskId)
  const important = task?.isImportant ?? false
  const folderId = task?.folderId
  const taskExpanded = isTaskExpanded(taskId)
  const hasSubtasks = getChildSubtasks(subtasks, null).length > 0
  const expandedIds = new Set(subtasks.filter((item) => isSubtaskExpanded(item.id)).map((item) => item.id))
  const attachments = getAttachmentsForTask(taskId)
  const [selectedPdf, setSelectedPdf] = useState<Attachment | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<Attachment | null>(null)
  const note = task?.content.trim() ?? ''
  const showDetails = taskExpanded && (Boolean(note) || attachments.length > 0 || hasSubtasks)

  const header = (
    <>
      <button
        type="button"
        aria-label={taskExpanded ? `Collapse ${title}` : `Expand ${title}`}
        aria-expanded={taskExpanded}
        onClick={() => toggleTaskExpanded(taskId)}
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          'text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        )}
      >
        {taskExpanded ? (
          <ChevronDown className="h-4 w-4" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden />
        )}
      </button>

      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm',
          'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        )}
      >
        <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        <span className="truncate font-medium">{title}</span>
      </button>
      <StarButton
        important={important}
        onToggle={() => toggleTaskImportant(taskId)}
      />
      <RowDeleteButton label={`Delete ${title}`} onClick={() => requestTaskDelete(taskId)} />
    </>
  )

  return (
    <div className="rounded-md px-1 py-1">
      {folderId ? (
        <SortableTaskRow taskId={taskId} folderId={folderId}>
          {header}
        </SortableTaskRow>
      ) : (
        <div className="flex items-center gap-0.5">{header}</div>
      )}

      {showDetails ? (
        <div className="ml-7 mt-1 space-y-2">
          {note ? (
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text)]">
              {task?.content}
            </p>
          ) : null}

          {attachments.length > 0 ? (
            <ul className="space-y-1">
              {attachments.map((attachment) => (
                <li key={attachment.id}>
                  {attachment.isImage ? (
                    <ImageAttachment
                      attachment={attachment}
                      expanded={isAttachmentExpanded(attachment.id)}
                      onToggleExpanded={() => toggleAttachmentExpanded(attachment.id)}
                    />
                  ) : attachment.isPdf ? (
                    <AttachmentItem
                      attachment={attachment}
                      onOpen={() => setSelectedPdf(attachment)}
                    />
                  ) : attachment.isDocument ? (
                    <AttachmentItem
                      attachment={attachment}
                      onOpen={() => setSelectedDocument(attachment)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {hasSubtasks ? (
            <SubtaskList
              parentSubtaskId={null}
              allSubtasks={subtasks}
              expandedIds={expandedIds}
              onToggleExpand={toggleSubtaskExpanded}
              onToggleCompleted={onToggleSubtask}
            />
          ) : null}
        </div>
      ) : null}

      <PdfPreviewDialog attachment={selectedPdf} onClose={() => setSelectedPdf(null)} />
      <DocumentPreviewDialog
        attachment={selectedDocument}
        onClose={() => setSelectedDocument(null)}
      />
      {dialog}
    </div>
  )
}
