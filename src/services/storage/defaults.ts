import { NOTES_STORAGE_VERSION, type AppSnapshot } from './types'

/** Empty notes document for a new local fallback session. Mock folders are not seeded. */
export function createDefaultSnapshot(): AppSnapshot {
  return {
    version: NOTES_STORAGE_VERSION,
    folders: [],
    tasks: [],
    subtasks: [],
    tags: [],
    uiState: {
      myNotesSidebarExpanded: true,
      expandedFolderIds: [],
      expandedTaskIds: [],
      expandedSubtaskIds: [],
      collapsedSubtaskIds: [],
    },
  }
}
