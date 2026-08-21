import { getSupabaseClient } from '../lib/supabase'
import { LocalAttachmentDataRepository } from './localAttachmentRepository'
import { LocalNotesDataRepository } from './localNotesRepository'
import { SupabaseAttachmentDataRepository } from './supabase/supabaseAttachmentRepository'
import { SupabaseNotesDataRepository } from './supabase/supabaseNotesRepository'
import type { AppRepositories, AttachmentDataRepository, NotesDataRepository } from './types'

export type { AppRepositories, AttachmentDataRepository, NotesDataRepository, MaybePromise, UiState } from './types'
export { LocalAttachmentDataRepository } from './localAttachmentRepository'
export { LocalNotesDataRepository } from './localNotesRepository'
export { RepositoryError } from './errors'
export { SupabaseAttachmentDataRepository } from './supabase/supabaseAttachmentRepository'
export { SupabaseNotesDataRepository } from './supabase/supabaseNotesRepository'

function createNotesRepository(): NotesDataRepository {
  return getSupabaseClient()
    ? new SupabaseNotesDataRepository()
    : new LocalNotesDataRepository()
}

function createAttachmentRepository(): AttachmentDataRepository {
  return getSupabaseClient()
    ? new SupabaseAttachmentDataRepository()
    : new LocalAttachmentDataRepository()
}

let notesRepository: NotesDataRepository | undefined
let attachmentRepository: AttachmentDataRepository | undefined

/** Authenticated app uses Supabase when configured. LocalStorage remains as fallback. */
export function getRepositories(): AppRepositories {
  return {
    notes: getNotesRepository(),
    attachments: getAttachmentRepository(),
  }
}

export function getNotesRepository(): NotesDataRepository {
  if (!notesRepository) {
    notesRepository = createNotesRepository()
  }
  return notesRepository
}

export function getAttachmentRepository(): AttachmentDataRepository {
  if (!attachmentRepository) {
    attachmentRepository = createAttachmentRepository()
  }
  return attachmentRepository
}
