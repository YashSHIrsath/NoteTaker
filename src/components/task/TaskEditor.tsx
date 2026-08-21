import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Folder, Task } from '../../types'
import { Button } from '../ui/Button'
import { FolderBreadcrumb } from '../folder/FolderBreadcrumb'
import { NoteEditor } from './TaskNoteEditor'
import { TaskTitleEditor } from './TaskTitleEditor'
import { SaveStatusLabel } from './SaveStatusLabel'
import { SubtaskList } from './SubtaskList'
import { CreateSubtaskDialog } from './CreateSubtaskDialog'
import { useFolders } from '../../hooks/useFolders'
import { getChildSubtasks, collectSubtaskAncestorIds } from '../../lib/subtasks'
import { StarButton } from '../common/StarButton'
import { RowDeleteButton } from '../common/RowDeleteButton'
import { AttachmentList } from '../attachment/AttachmentList'
import { useDeleteTask } from '../../hooks/useDeleteTask'
import { useDeleteSubtask } from '../../hooks/useDeleteSubtask'
import { useDeleteAttachment } from '../../hooks/useDeleteAttachment'

export interface TaskEditorProps {
  task: Task
  folderPath: Folder[]
}

export function TaskEditor({ task, folderPath }: TaskEditorProps) {
  const {
    getSubtasksForTask,
    createSubtask,
    updateSubtaskTitle,
    toggleSubtaskCompleted,
    isSubtaskExpanded,
    toggleSubtaskExpanded,
    expandSubtask,
    toggleTaskImportant,
    updateTaskTitle,
    updateTaskContent,
    getAttachmentsForTask,
    addImageAttachment,
    addPdfAttachment,
    addDocumentAttachment,
    toggleAttachmentExpanded,
    isAttachmentExpanded,
    isUploadingAttachment,
    removingAttachmentId,
    saveStatus,
  } = useFolders()
  const { requestTaskDelete, dialog: taskDeleteDialog } = useDeleteTask()
  const { requestSubtaskDelete, dialog: subtaskDeleteDialog } = useDeleteSubtask()
  const { requestAttachmentDelete, dialog: attachmentDeleteDialog } = useDeleteAttachment()
  const subtasks = getSubtasksForTask(task.id)
  const attachments = getAttachmentsForTask(task.id)
  const expandedIds = new Set(subtasks.filter((item) => isSubtaskExpanded(item.id)).map((item) => item.id))
  const expandedAttachmentIds = new Set(
    attachments.filter((attachment) => isAttachmentExpanded(attachment.id)).map((item) => item.id),
  )
  const [createParentId, setCreateParentId] = useState<string | null | false>(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const revealId = (location.state as { revealSubtaskId?: string } | null)?.revealSubtaskId
    if (!revealId) {
      return
    }
    if (!subtasks.some((item) => item.id === revealId)) {
      return
    }
    for (const ancestorId of collectSubtaskAncestorIds(subtasks, revealId)) {
      expandSubtask(ancestorId)
    }
    const timer = window.setTimeout(() => {
      document.getElementById(`subtask-${revealId}`)?.scrollIntoView({ block: 'nearest' })
    }, 0)
    navigate(location.pathname, { replace: true, state: null })
    return () => window.clearTimeout(timer)
  }, [expandSubtask, location.pathname, location.state, navigate, subtasks])

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-3xl flex-col overflow-y-auto px-4 py-5 sm:px-6">
      <FolderBreadcrumb path={folderPath} currentLabel={task.title.trim() || 'Untitled'} />

      <div className="mt-5 flex shrink-0 items-center gap-2">
        <TaskTitleEditor value={task.title} onChange={(title) => updateTaskTitle(task.id, title)} />
        <StarButton important={task.isImportant} onToggle={() => toggleTaskImportant(task.id)} />
        <RowDeleteButton
          label={`Delete ${task.title.trim() || 'Untitled'}`}
          onClick={() => requestTaskDelete(task.id)}
        />
        <SaveStatusLabel status={saveStatus} />
      </div>

      <NoteEditor
        value={task.content}
        onChange={(content) => updateTaskContent(task.id, content)}
        className="mt-4 shrink-0"
      />

      <section className="mt-8 shrink-0 border-t border-[var(--color-border)] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Subtasks
          </h2>
          <Button variant="subtle" size="sm" onClick={() => setCreateParentId(null)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add Subtask
          </Button>
        </div>

        <div className="mt-3">
          {getChildSubtasks(subtasks, null).length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No subtasks</p>
          ) : (
            <SubtaskList
              parentSubtaskId={null}
              allSubtasks={subtasks}
              expandedIds={expandedIds}
              onToggleExpand={toggleSubtaskExpanded}
              onToggleCompleted={toggleSubtaskCompleted}
              onAddChild={(parentId) => setCreateParentId(parentId)}
              onRename={updateSubtaskTitle}
              onDelete={requestSubtaskDelete}
            />
          )}
        </div>
      </section>

      <section className="mt-8 shrink-0 border-t border-[var(--color-border)] pt-6 pb-8">
        <AttachmentList
          attachments={attachments}
          expandedIds={expandedAttachmentIds}
          onAddImage={(file) => addImageAttachment(task.id, file)}
          onAddPdf={(file) => addPdfAttachment(task.id, file)}
          onAddDocument={(file) => addDocumentAttachment(task.id, file)}
          onRemove={(attachmentId) => {
            const attachment = attachments.find((item) => item.id === attachmentId)
            requestAttachmentDelete(attachmentId, attachment?.name ?? 'attachment')
          }}
          onToggleExpanded={toggleAttachmentExpanded}
          busy={isUploadingAttachment}
          removingId={removingAttachmentId}
        />
      </section>

      <CreateSubtaskDialog
        open={createParentId !== false}
        onClose={() => setCreateParentId(false)}
        onCreate={(title) => {
          const parentId = createParentId === false ? null : createParentId
          return createSubtask(title, task.id, parentId).then(() => {
            if (parentId) {
              expandSubtask(parentId)
            }
          })
        }}
      />
      {taskDeleteDialog}
      {subtaskDeleteDialog}
      {attachmentDeleteDialog}
    </div>
  )
}
