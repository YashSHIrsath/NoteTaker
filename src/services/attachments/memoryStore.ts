import type { AttachmentStore } from './types'

export class MemoryAttachmentStore implements AttachmentStore {
  private readonly files = new Map<string, File>()
  private readonly previews = new Map<string, string>()

  storeFile(file: File): { id: string; previewUrl: string } {
    const id = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(file)
    this.files.set(id, file)
    this.previews.set(id, previewUrl)
    return { id, previewUrl }
  }

  getPreviewUrl(id: string): string | null {
    return this.previews.get(id) ?? null
  }

  getFile(id: string): File | null {
    return this.files.get(id) ?? null
  }
}
