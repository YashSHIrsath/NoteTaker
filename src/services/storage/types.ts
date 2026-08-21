import type { Folder, Subtask, Task } from '../../types'

export const NOTES_STORAGE_VERSION = 4

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
  uiState: UiState
}

export interface NotesRepository {
  load(): AppSnapshot | null
  save(snapshot: AppSnapshot): void
}
