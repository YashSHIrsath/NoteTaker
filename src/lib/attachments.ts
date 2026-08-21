import type { Attachment } from '../types'

export function getAttachmentsByTask(
  attachments: Attachment[],
  taskId: string,
): Attachment[] {
  return attachments.filter((attachment) => attachment.taskId === taskId)
}
