import { MemoryAttachmentStore } from '../services/attachments/memoryStore'
import { assertAllowedAttachmentFile, defaultMimeForType } from '../services/attachments'
import type { AttachmentStore } from '../services/attachments/types'
import type { Attachment } from '../types'
import type { AttachmentDataRepository } from './types'

/**
 * In-memory attachment files for the current session.
 * Used when Supabase is not configured.
 */
export class LocalAttachmentDataRepository implements AttachmentDataRepository {
  private readonly store: AttachmentStore
  private readonly attachments = new Map<string, Attachment>()
  private readonly files = new Map<string, File>()

  constructor(store: AttachmentStore = new MemoryAttachmentStore()) {
    this.store = store
  }

  createAttachment(taskId: string, file: File): Attachment {
    const type = assertAllowedAttachmentFile(file)
    const stored = this.store.storeFile(file)
    const attachment: Attachment = {
      id: stored.id,
      taskId,
      type,
      name: file.name,
      mimeType: file.type || defaultMimeForType(type),
      isImage: type === 'image',
      isPdf: type === 'pdf',
      isDocument: type !== 'image' && type !== 'pdf',
      previewUrl: stored.previewUrl,
    }
    this.attachments.set(attachment.id, attachment)
    this.files.set(attachment.id, file)
    return attachment
  }

  getFile(id: string): File | null {
    return this.files.get(id) ?? this.store.getFile(id)
  }

  getPreviewUrl(id: string): string | null {
    return this.attachments.get(id)?.previewUrl ?? this.store.getPreviewUrl(id)
  }

  deleteAttachment(id: string): void {
    this.attachments.delete(id)
    this.files.delete(id)
  }

  listAttachments(): Attachment[] {
    return [...this.attachments.values()]
  }

  listStoragePathsForTaskIds(_taskIds: string[]): string[] {
    return []
  }

  removeStoragePaths(_paths: string[]): void {
    /* in-memory files have no Storage objects */
  }

  clearCache(): void {
    this.attachments.clear()
    this.files.clear()
  }
}
