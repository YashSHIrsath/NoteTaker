import type { Folder, Subtask, Tag, Task } from '../../types'

export const NOTES_STORAGE_VERSION = 11

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
  uiState: UiState
}

export interface NotesRepository {
  load(): AppSnapshot | null
  save(snapshot: AppSnapshot): void
}
