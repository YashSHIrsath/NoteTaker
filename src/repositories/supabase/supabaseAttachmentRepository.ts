import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabase'
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_SIGNED_URL_SECONDS,
  assertAllowedAttachmentFile,
  buildAttachmentStoragePath,
  defaultMimeForType,
} from '../../services/attachments'
import { RepositoryError, toRepositoryError } from '../errors'
import type { AttachmentDataRepository } from '../types'
import type { Attachment, AttachmentType } from '../../types'
import { attachmentFromRow, type AttachmentRow } from './mappers'

function toStorageUploadError(error: { message?: string }): RepositoryError {
  const message = (error.message ?? '').toLowerCase()
  if (message.includes('mime')) {
    return new RepositoryError('This file type is not supported.', { cause: error })
  }
  if (message.includes('already exists') || message.includes('duplicate')) {
    return new RepositoryError('This file was already uploaded.', { cause: error })
  }
  if (message.includes('row-level security') || message.includes('unauthorized')) {
    return new RepositoryError('You do not have permission to attach files to this task.', { cause: error })
  }
  if (message.includes('bucket') && message.includes('not found')) {
    return new RepositoryError('File storage is not available yet.', { cause: error })
  }
  return new RepositoryError('Could not upload the file.', { cause: error })
}

function throwIfError(error: { message?: string } | null, fallback: string): void {
  if (error) {
    throw toRepositoryError(error, fallback)
  }
}

interface CachedAttachment {
  row: AttachmentRow
  localTaskId: string
  file: File | null
  previewUrl: string
}

export class SupabaseAttachmentDataRepository implements AttachmentDataRepository {
  private readonly client: SupabaseClient
  private readonly cache = new Map<string, CachedAttachment>()

  constructor(client: SupabaseClient | null = getSupabaseClient()) {
    if (!client) {
      throw new RepositoryError('Supabase is not configured.')
    }
    this.client = client
  }

  async listAttachments(): Promise<Attachment[]> {
    await this.requireUser()
    const reverseTaskIds = await this.loadLocalTaskIdByCloudId()
    const { data, error } = await this.client
      .from('attachments')
      .select('id,task_id,type,name,mime_type,storage_path,file_size')
    throwIfError(error, 'Could not load attachments.')
    const rows = (data ?? []) as AttachmentRow[]
    const previewUrls = await Promise.all(
      rows.map((row) => (row.storage_path ? this.signPath(row.storage_path) : Promise.resolve(''))),
    )
    const attachments: Attachment[] = rows.map((row, index) => {
      const localTaskId = reverseTaskIds[row.task_id] ?? row.task_id
      const previewUrl = previewUrls[index]
      this.cache.set(row.id, {
        row,
        localTaskId,
        file: this.cache.get(row.id)?.file ?? null,
        previewUrl,
      })
      return attachmentFromRow(row, previewUrl, localTaskId)
    })
    return attachments
  }

  async createAttachment(taskId: string, file: File): Promise<Attachment> {
    let type: AttachmentType
    try {
      type = assertAllowedAttachmentFile(file)
    } catch (error) {
      throw new RepositoryError(error instanceof Error ? error.message : 'This file could not be attached.')
    }
    const user = await this.requireUser()
    const cloudTaskId = await this.resolveCloudTaskId(taskId)
    const id = crypto.randomUUID()
    const storagePath = buildAttachmentStoragePath(user.id, cloudTaskId, id, file.name)
    const mimeType = defaultMimeForType(type)

    const { error: uploadError } = await this.client.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, file, {
        upsert: false,
        contentType: mimeType,
      })
    if (uploadError) {
      throw toRepositoryError(uploadError, toStorageUploadError(uploadError).message)
    }

    const { error: insertError } = await this.client.from('attachments').insert({
      id,
      task_id: cloudTaskId,
      type,
      name: file.name,
      mime_type: mimeType,
      storage_path: storagePath,
      file_size: file.size,
    })
    if (insertError) {
      await this.client.storage.from(ATTACHMENTS_BUCKET).remove([storagePath])
      throw toRepositoryError(insertError, 'Could not save attachment details.')
    }

    let previewUrl = ''
    try {
      previewUrl = await this.signPath(storagePath)
    } catch {
      previewUrl = ''
    }
    const row: AttachmentRow = {
      id,
      task_id: cloudTaskId,
      type,
      name: file.name,
      mime_type: mimeType,
      storage_path: storagePath,
      file_size: file.size,
    }
    this.cache.set(id, { row, localTaskId: taskId, file, previewUrl })
    return attachmentFromRow(row, previewUrl, taskId)
  }

  async getFile(id: string): Promise<File | null> {
    const cached = this.cache.get(id)
    if (cached?.file) {
      return cached.file
    }
    const row = cached?.row ?? (await this.loadRow(id))
    if (!row?.storage_path) {
      return null
    }
    const { data, error } = await this.client.storage.from(ATTACHMENTS_BUCKET).download(row.storage_path)
    throwIfError(error, 'Could not download the file.')
    if (!data) {
      return null
    }
    const file = new File([data], row.name, { type: row.mime_type })
    const previewUrl = cached?.previewUrl || (await this.signPath(row.storage_path))
    this.cache.set(id, {
      row,
      localTaskId: cached?.localTaskId ?? row.task_id,
      file,
      previewUrl,
    })
    return file
  }

  async getPreviewUrl(id: string): Promise<string | null> {
    const cached = this.cache.get(id)
    if (cached?.previewUrl) {
      return cached.previewUrl
    }
    const row = cached?.row ?? (await this.loadRow(id))
    if (!row?.storage_path) {
      return null
    }
    const previewUrl = await this.signPath(row.storage_path)
    this.cache.set(id, {
      row,
      localTaskId: cached?.localTaskId ?? row.task_id,
      file: cached?.file ?? null,
      previewUrl,
    })
    return previewUrl
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.requireUser()
    const cached = this.cache.get(id)
    const row = cached?.row ?? (await this.loadRow(id))
    if (!row) {
      throw new RepositoryError('Could not delete the attachment.')
    }
    if (row.storage_path) {
      const { error: storageError } = await this.client.storage
        .from(ATTACHMENTS_BUCKET)
        .remove([row.storage_path])
      throwIfError(storageError, 'Could not delete the file.')
    }
    const { data, error } = await this.client.from('attachments').delete().eq('id', id).select('id')
    throwIfError(error, 'Could not delete the attachment.')
    if (!data || data.length === 0) {
      throw new RepositoryError('Could not delete the attachment.')
    }
    this.cache.delete(id)
  }

  async listStoragePathsForTaskIds(taskIds: string[]): Promise<string[]> {
    await this.requireUser()
    if (taskIds.length === 0) {
      return []
    }
    const { data, error } = await this.client
      .from('attachments')
      .select('storage_path')
      .in('task_id', taskIds)
    throwIfError(error, 'Could not look up attachments.')
    return ((data ?? []) as Array<{ storage_path: string | null }>)
      .map((row) => row.storage_path)
      .filter((path): path is string => Boolean(path))
  }

  async removeStoragePaths(paths: string[]): Promise<void> {
    await this.requireUser()
    const unique = [...new Set(paths.filter(Boolean))]
    if (unique.length === 0) {
      return
    }
    for (let index = 0; index < unique.length; index += 50) {
      const chunk = unique.slice(index, index + 50)
      const { error } = await this.client.storage.from(ATTACHMENTS_BUCKET).remove(chunk)
      throwIfError(error, 'Could not delete the file.')
    }
  }

  clearCache(): void {
    this.cache.clear()
  }

  private async loadRow(id: string): Promise<AttachmentRow | null> {
    const { data, error } = await this.client
      .from('attachments')
      .select('id,task_id,type,name,mime_type,storage_path,file_size')
      .eq('id', id)
      .limit(1)
    throwIfError(error, 'Could not load attachments.')
    return ((data ?? [])[0] as AttachmentRow | undefined) ?? null
  }

  private async signPath(path: string): Promise<string> {
    const { data, error } = await this.client.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(path, ATTACHMENT_SIGNED_URL_SECONDS)
    throwIfError(error, 'Could not create a preview link.')
    return data?.signedUrl ?? ''
  }

  private async requireUser(): Promise<{ id: string }> {
    const { data, error } = await this.client.auth.getUser()
    throwIfError(error, 'You need to be signed in to attach files.')
    if (!data.user) {
      throw new RepositoryError('You need to be signed in to attach files.')
    }
    return data.user
  }

  private async resolveCloudTaskId(localTaskId: string): Promise<string> {
    const { data, error } = await this.client.from('tasks').select('id').eq('id', localTaskId).limit(1)
    throwIfError(error, 'Could not verify the task.')
    const existing = (data ?? [])[0] as { id: string } | undefined
    if (existing?.id) {
      return existing.id
    }

    const user = await this.requireUser()
    const { data: markerRows, error: markerError } = await this.client
      .from('notes_migrations')
      .select('id_map')
      .eq('user_id', user.id)
      .limit(1)
    throwIfError(markerError, 'Could not verify the task.')
    const marker = (markerRows ?? [])[0] as { id_map?: { tasks?: Record<string, string> } } | undefined
    const mapped = marker?.id_map?.tasks?.[localTaskId]
    if (mapped) {
      const { data: mappedRows, error: mappedError } = await this.client
        .from('tasks')
        .select('id')
        .eq('id', mapped)
        .limit(1)
      throwIfError(mappedError, 'Could not verify the task.')
      if ((mappedRows ?? [])[0]) {
        return mapped
      }
    }

    throw new RepositoryError('This task is not in your cloud notes yet. Migrate notes first, then attach files.')
  }

  private async loadLocalTaskIdByCloudId(): Promise<Record<string, string>> {
    const userResult = await this.client.auth.getUser()
    const userId = userResult.data.user?.id
    if (!userId) {
      return {}
    }
    const { data, error } = await this.client
      .from('notes_migrations')
      .select('id_map')
      .eq('user_id', userId)
      .limit(1)
    throwIfError(error, 'Could not load attachments.')
    const map = ((data ?? [])[0] as { id_map?: { tasks?: Record<string, string> } } | undefined)?.id_map?.tasks
    if (!map) {
      return {}
    }
    const reverse: Record<string, string> = {}
    for (const [localId, cloudId] of Object.entries(map)) {
      reverse[cloudId] = localId
    }
    return reverse
  }
}
