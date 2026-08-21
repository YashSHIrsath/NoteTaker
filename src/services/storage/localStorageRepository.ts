import { migrateSnapshot } from './migrate'
import { parseSnapshot } from './validate'
import type { AppSnapshot, NotesRepository } from './types'

export const NOTES_STORAGE_KEY = 'MYNOTES_DATA'

export class LocalStorageNotesRepository implements NotesRepository {
  private readonly key: string

  constructor(key: string = NOTES_STORAGE_KEY) {
    this.key = key
  }

  load(): AppSnapshot | null {
    if (typeof window === 'undefined') {
      return null
    }

    try {
      const raw = window.localStorage.getItem(this.key)
      if (!raw) {
        return null
      }
      return parseSnapshot(migrateSnapshot(JSON.parse(raw) as unknown))
    } catch {
      return null
    }
  }

  save(snapshot: AppSnapshot): void {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(this.key, JSON.stringify(snapshot))
  }
}
