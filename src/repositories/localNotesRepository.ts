import { createDefaultSnapshot } from '../services/storage/defaults'
import { LocalStorageNotesRepository } from '../services/storage/localStorageRepository'
import { NOTES_STORAGE_VERSION, type AppSnapshot, type NotesRepository } from '../services/storage/types'
import { applyOpsToSnapshot, type NotesOp } from '../services/notes/ops'
import { RepositoryError } from './errors'
import type { NotesDataRepository } from './types'

/**
 * LocalStorage-backed notes document.
 * Kept as a fallback/development implementation. Authenticated users use Supabase.
 *
 * Personal notes only, and that is a decision rather than an omission: a shared space is other
 * people, and there is nobody else inside one browser's LocalStorage. An offline queue against a
 * document with several authors is a conflict-resolution project, not a fallback — so the factory
 * refuses to back a space with this, instead of quietly giving one person a private copy of a
 * shared workspace.
 */
export class LocalNotesDataRepository implements NotesDataRepository {
  private readonly storage: NotesRepository

  constructor(storage: NotesRepository = new LocalStorageNotesRepository()) {
    this.storage = storage
  }

  load(): AppSnapshot {
    const existing = this.storage.load()
    if (existing) {
      return existing
    }

    const initial = createDefaultSnapshot()
    this.storage.save(initial)
    return initial
  }

  /**
   * Folds the batch into the stored document.
   *
   * There is no upsert-then-reconcile here and no diffing — applyOpsToSnapshot is the same function
   * the Supabase path uses to advance its record of what the server holds, so both implementations
   * agree on what a batch means by construction rather than by two people keeping them in step.
   */
  /** `intent` is accepted and ignored: there is nobody else here to attribute anything to. */
  apply(ops: NotesOp[]): void {
    if (ops.length === 0) {
      return
    }
    const current = this.load()
    this.requireDeletableRows(current, ops)
    const next = applyOpsToSnapshot(current, ops)
    this.storage.save({ ...next, version: NOTES_STORAGE_VERSION })
  }

  /**
   * A delete has to fail when there is nothing to delete.
   *
   * The Supabase path gets this for free — it asks which rows the delete matched and throws when
   * none did. Callers lean on it to tell "already gone" from "never existed", so the local path has
   * to answer the same way; silently succeeding would let a stale UI report a deletion that never
   * happened.
   */
  private requireDeletableRows(snapshot: AppSnapshot, ops: NotesOp[]): void {
    for (const op of ops) {
      if (op.action !== 'delete') {
        continue
      }
      const exists =
        op.entity === 'folder'
          ? snapshot.folders.some((folder) => folder.id === op.id)
          : op.entity === 'task'
            ? snapshot.tasks.some((task) => task.id === op.id)
            : op.entity === 'subtask'
              ? snapshot.subtasks.some((subtask) => subtask.id === op.id)
              : snapshot.tags.some((tag) => tag.id === op.id)
      if (!exists) {
        throw new RepositoryError(DELETE_FAILURES[op.entity])
      }
    }
  }
}

/** The same sentences the Supabase path raises, so a caller's error handling doesn't depend on
 *  which repository it happens to be talking to. */
const DELETE_FAILURES: Record<'folder' | 'task' | 'subtask' | 'tag', string> = {
  folder: 'Could not delete the folder.',
  task: 'Could not delete the task.',
  subtask: 'Could not delete the subtask.',
  tag: 'Could not delete the tag.',
}
