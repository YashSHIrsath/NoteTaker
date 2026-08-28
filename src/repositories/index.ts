import { getSupabaseClient } from '../lib/supabase'
import { PERSONAL_WORKSPACE, workspaceKey, type WorkspaceRef } from '../lib/workspace'
import { RepositoryError } from './errors'
import { LocalAttachmentDataRepository } from './localAttachmentRepository'
import { LocalNotesDataRepository } from './localNotesRepository'
import { LocalRemindersDataRepository } from './localRemindersRepository'
import { SupabaseAttachmentDataRepository } from './supabase/supabaseAttachmentRepository'
import { SupabaseNotesDataRepository } from './supabase/supabaseNotesRepository'
import { SupabaseRemindersDataRepository } from './supabase/supabaseRemindersRepository'
import { SupabaseSpacesDataRepository } from './supabase/supabaseSpacesRepository'
import type {
  AppRepositories,
  AttachmentDataRepository,
  NotesDataRepository,
  RemindersDataRepository,
  SpacesDataRepository,
} from './types'

export type {
  AppRepositories,
  AttachmentDataRepository,
  NotesDataRepository,
  RemindersDataRepository,
  SpacesDataRepository,
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
export { SupabaseSpacesDataRepository } from './supabase/supabaseSpacesRepository'

function createNotesRepository(workspace: WorkspaceRef): NotesDataRepository {
  if (getSupabaseClient()) {
    return new SupabaseNotesDataRepository(undefined, workspace)
  }
  if (workspace.kind === 'space') {
    // Reached only by opening a /s/:spaceId link in a build with no Supabase configured. The route
    // guard sends those to personal notes first; this is the backstop, and it says what is wrong
    // rather than handing back an empty document that looks like an empty space.
    throw new RepositoryError('Shared spaces need a server connection.')
  }
  return new LocalNotesDataRepository()
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

/**
 * One notes repository per workspace, remembered.
 *
 * It used to be a single instance because there was a single document. Now a repository carries the
 * scope it reads and writes, so there is one per workspace — cached rather than rebuilt because
 * FolderProvider derives it on every render and a fresh object each time would re-run the load
 * effect forever.
 */
const notesRepositories = new Map<string, NotesDataRepository>()
let remindersRepository: RemindersDataRepository | undefined
let attachmentRepository: AttachmentDataRepository | undefined

/**
 * Authenticated app uses Supabase when configured. LocalStorage remains as fallback.
 *
 * Reminders and attachments are not workspace-scoped here. Both are read by id from the rows the
 * notes document already holds, and both are filtered by the same RLS chain, so the extra rows a
 * space session can see are ones nothing on screen ever looks up. Giving them a scope is worth
 * doing when they gain a query that lists rather than looks up.
 */
export function getRepositories(workspace: WorkspaceRef = PERSONAL_WORKSPACE): AppRepositories {
  return {
    notes: getNotesRepository(workspace),
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

export function getNotesRepository(
  workspace: WorkspaceRef = PERSONAL_WORKSPACE,
): NotesDataRepository {
  const key = workspaceKey(workspace)
  const existing = notesRepositories.get(key)
  if (existing) {
    return existing
  }
  const created = createNotesRepository(workspace)
  notesRepositories.set(key, created)
  return created
}

/**
 * Spaces need a server; there is nobody else inside one browser's LocalStorage.
 *
 * Returns null rather than throwing, because the Shared Spaces page is a legitimate thing to open in
 * a build with no Supabase configured — it just has nothing to show, and says so.
 */
let spacesRepository: SpacesDataRepository | null | undefined
export function getSpacesRepository(): SpacesDataRepository | null {
  if (spacesRepository === undefined) {
    spacesRepository = getSupabaseClient() ? new SupabaseSpacesDataRepository() : null
  }
  return spacesRepository
}

export function getAttachmentRepository(): AttachmentDataRepository {
  if (!attachmentRepository) {
    attachmentRepository = createAttachmentRepository()
  }
  return attachmentRepository
}
