import type { ContentSharing, Folder, Subtask, Tag, Task } from '../../types'

export const NOTES_STORAGE_VERSION = 12

export interface UiState {
  myNotesSidebarExpanded: boolean
  expandedFolderIds: string[]
  expandedTaskIds: string[]
  expandedSubtaskIds: string[]
  collapsedSubtaskIds: string[]
}

export interface AppSnapshot {
  version: number
  folders: Folder[]
  tasks: Task[]
  subtasks: Subtask[]
  /** Every tag this account has made, whether or not anything currently carries it — a tag you
   *  created and then removed from its last task is still yours to reach for. */
  tags: Tag[]
  /**
   * Who can see each folder and note in this workspace.
   *
   * Optional, and genuinely so rather than for convenience: a personal workspace has exactly one
   * reader, so there is nothing for a visibility to mean and nothing here to carry. Absent therefore
   * means "no privacy in play", which is the correct reading for personal notes, for localStorage,
   * and for a database that has not had the privacy migration applied yet.
   *
   * Never used to decide access. Every row in the arrays above has already been through RLS on the
   * way here — an item the reader cannot see is simply not in them — so this is what draws the badge
   * and fills the share sheet, and nothing more. See lib/contentPrivacy.ts.
   */
  sharing?: ContentSharing[]
  uiState: UiState
}

export interface NotesRepository {
  load(): AppSnapshot | null
  save(snapshot: AppSnapshot): void
}
