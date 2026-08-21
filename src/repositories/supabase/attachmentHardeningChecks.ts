import type { SupabaseClient } from '@supabase/supabase-js'
import { RepositoryError } from '../errors'
import { SupabaseAttachmentDataRepository } from './supabaseAttachmentRepository'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function fakeFile(name = 'photo.png'): File {
  return new File([new Uint8Array(8)], name, { type: 'image/png' })
}

function createAttachmentClient(options: {
  uploadError?: { message: string } | null
  insertError?: { message: string } | null
  removeError?: { message: string } | null
  deleteError?: { message: string } | null
}): SupabaseClient & { removed: string[]; inserts: unknown[] } {
  const removed: string[] = []
  const inserts: unknown[] = []
  const taskId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  const client = {
    removed,
    inserts,
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
          error: null,
        }),
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ error: options.uploadError ?? null }),
        remove: (paths: string[]) => {
          removed.push(...paths)
          return Promise.resolve({ error: options.removeError ?? null })
        },
        createSignedUrl: () =>
          Promise.resolve({ data: { signedUrl: 'https://example.test/signed' }, error: null }),
        download: () => Promise.resolve({ data: new Blob(['x']), error: null }),
      }),
    },
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            limit: () =>
              Promise.resolve({
                data:
                  table === 'tasks'
                    ? [{ id: taskId }]
                    : [
                        {
                          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                          task_id: taskId,
                          type: 'image',
                          name: 'photo.png',
                          mime_type: 'image/png',
                          storage_path: 'user/task/id-photo.png',
                          file_size: 8,
                        },
                      ],
                error: null,
              }),
          }),
        }),
        insert: (row: unknown) => {
          inserts.push(row)
          return Promise.resolve({ error: options.insertError ?? null })
        },
        delete: () => ({
          eq: () => ({
            select: () =>
              Promise.resolve({
                data: options.deleteError ? [] : [{ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }],
                error: options.deleteError ?? null,
              }),
          }),
        }),
      }
    },
  }
  return client as unknown as SupabaseClient & { removed: string[]; inserts: unknown[] }
}

export async function runAttachmentHardeningChecks(): Promise<void> {
  const uploadFailClient = createAttachmentClient({
    uploadError: { message: 'Failed to fetch' },
  })
  try {
    await new SupabaseAttachmentDataRepository(uploadFailClient).createAttachment(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      fakeFile(),
    )
    throw new Error('expected upload failure')
  } catch (error) {
    assert(error instanceof RepositoryError, 'upload failure is RepositoryError')
    assert(uploadFailClient.inserts.length === 0, 'failed upload does not write metadata')
    assert(
      error instanceof RepositoryError && error.message !== 'Failed to fetch',
      'raw upload network text is not surfaced',
    )
  }

  const metadataFailClient = createAttachmentClient({
    insertError: { message: 'insert failed' },
  })
  try {
    await new SupabaseAttachmentDataRepository(metadataFailClient).createAttachment(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      fakeFile(),
    )
    throw new Error('expected metadata failure')
  } catch (error) {
    assert(error instanceof RepositoryError, 'metadata failure is RepositoryError')
    assert(
      error instanceof RepositoryError && error.message === 'Could not save attachment details.',
      'metadata failure stays user-facing',
    )
    assert(metadataFailClient.removed.length === 1, 'uploaded object is removed after metadata failure')
  }

  const deleteFailClient = createAttachmentClient({
    deleteError: { message: 'delete failed' },
  })
  try {
    await new SupabaseAttachmentDataRepository(deleteFailClient).deleteAttachment(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    )
    throw new Error('expected delete failure')
  } catch (error) {
    assert(error instanceof RepositoryError, 'delete failure is RepositoryError')
    assert(
      error instanceof RepositoryError && error.message === 'Could not delete the attachment.',
      'delete failure stays user-facing',
    )
    assert(deleteFailClient.removed.length === 1, 'storage is deleted before metadata')
  }
}
