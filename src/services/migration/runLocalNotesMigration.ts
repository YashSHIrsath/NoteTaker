import { getSupabaseClient } from '../../lib/supabase'
import { RepositoryError } from '../../repositories/errors'
import { LocalStorageNotesRepository } from '../storage/localStorageRepository'
import { NotesLocalToSupabaseMigration } from './notesMigrationService'
import { SupabaseMappedNotesInsert, SupabaseMigrationMarkerStore } from './supabaseStores'
import type { MigrationResult } from './types'

/**
 * One-time LocalStorage → Supabase notes migration.
 * Does not write LocalStorage. Does not switch the active repository.
 */
export async function migrateLocalNotesToSupabase(userId: string): Promise<MigrationResult> {
  const client = getSupabaseClient()
  if (!client) {
    throw new RepositoryError('Supabase is not configured.')
  }
  if (!userId) {
    throw new RepositoryError('You need to be signed in to migrate notes.')
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError || !sessionData.session) {
    throw new RepositoryError('You need to be signed in to migrate notes.')
  }

  const storage = new LocalStorageNotesRepository()
  const migration = new NotesLocalToSupabaseMigration(
    {
      readSnapshot: () => storage.load(),
    },
    new SupabaseMigrationMarkerStore(client),
    new SupabaseMappedNotesInsert(client),
    userId,
  )

  return migration.run()
}
