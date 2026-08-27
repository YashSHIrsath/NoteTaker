import { getSupabaseClient } from '../lib/supabase'
import { LocalAttachmentDataRepository } from './localAttachmentRepository'
import { LocalNotesDataRepository } from './localNotesRepository'
import { LocalRemindersDataRepository } from './localRemindersRepository'
import { SupabaseAttachmentDataRepository } from './supabase/supabaseAttachmentRepository'
import { SupabaseNotesDataRepository } from './supabase/supabaseNotesRepository'
import { SupabaseRemindersDataRepository } from './supabase/supabaseRemindersRepository'
import type {
  AppRepositories,
  AttachmentDataRepository,
  NotesDataRepository,
  RemindersDataRepository,
} from './types'

export type {
  AppRepositories,
  AttachmentDataRepository,
  NotesDataRepository,
  RemindersDataRepository,
  MaybePromise,
  UiState,
} from './types'
export { LocalAttachmentDataRepository } from './localAttachmentRepository'
export { LocalNotesDataRepository } from './localNotesRepository'
export { LocalRemindersDataRepository } from './localRemindersRepository'
export { RepositoryError } from './errors'
export { SupabaseAttachmentDataRepository } from './supabase/supabaseAttachmentRepository'
export { SupabaseNotesDataRepository } from './supabase/supabaseNotesRepository'
export { SupabaseRemindersDataRepository } from './supabase/supabaseRemindersRepository'

function createNotesRepository(): NotesDataRepository {
  return getSupabaseClient()
    ? new SupabaseNotesDataRepository()
    : new LocalNotesDataRepository()
}

function createRemindersRepository(): RemindersDataRepository {
  return getSupabaseClient()
    ? new SupabaseRemindersDataRepository()
    : new LocalRemindersDataRepository()
}

function createAttachmentRepository(): AttachmentDataRepository {
  return getSupabaseClient()
    ? new SupabaseAttachmentDataRepository()
    : new LocalAttachmentDataRepository()
}

let notesRepository: NotesDataRepository | undefined
let remindersRepository: RemindersDataRepository | undefined
let attachmentRepository: AttachmentDataRepository | undefined

/** Authenticated app uses Supabase when configured. LocalStorage remains as fallback. */
export function getRepositories(): AppRepositories {
  return {
    notes: getNotesRepository(),
    attachments: getAttachmentRepository(),
    reminders: getRemindersRepository(),
  }
}

export function getRemindersRepository(): RemindersDataRepository {
  if (!remindersRepository) {
    remindersRepository = createRemindersRepository()
  }
  return remindersRepository
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
