import type { UiState } from '../../services/storage/types'

const UI_STATE_KEY = 'MYNOTES_UI_STATE'

export function defaultUiState(): UiState {
  return {
    myNotesSidebarExpanded: true,
    expandedFolderIds: [],
    expandedTaskIds: [],
    expandedSubtaskIds: [],
    collapsedSubtaskIds: [],
  }
}

function storageKey(userId?: string | null): string {
  return userId ? `${UI_STATE_KEY}:${userId}` : UI_STATE_KEY
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function normalizeUiState(value: Partial<UiState> | Record<string, unknown>): UiState {
  const fallback = defaultUiState()
  return {
    myNotesSidebarExpanded:
      typeof value.myNotesSidebarExpanded === 'boolean'
        ? value.myNotesSidebarExpanded
        : fallback.myNotesSidebarExpanded,
    expandedFolderIds: isStringArray(value.expandedFolderIds)
      ? value.expandedFolderIds
      : fallback.expandedFolderIds,
    expandedTaskIds: isStringArray(value.expandedTaskIds)
      ? value.expandedTaskIds
      : fallback.expandedTaskIds,
    expandedSubtaskIds: isStringArray(value.expandedSubtaskIds)
      ? value.expandedSubtaskIds
      : fallback.expandedSubtaskIds,
    collapsedSubtaskIds: isStringArray(value.collapsedSubtaskIds)
      ? value.collapsedSubtaskIds
      : fallback.collapsedSubtaskIds,
  }
}

export function isSubtaskExpandedInUi(uiState: Pick<UiState, 'collapsedSubtaskIds'>, subtaskId: string): boolean {
  return !uiState.collapsedSubtaskIds.includes(subtaskId)
}

export function loadPersistedUiState(userId?: string | null): UiState {
  if (typeof window === 'undefined') {
    return defaultUiState()
  }

  try {
    const raw = window.localStorage.getItem(storageKey(userId)) ?? (userId ? window.localStorage.getItem(UI_STATE_KEY) : null)
    if (!raw) {
      return defaultUiState()
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return defaultUiState()
    }
    const record = parsed as Record<string, unknown>
    if (
      typeof record.myNotesSidebarExpanded !== 'boolean' ||
      !isStringArray(record.expandedFolderIds) ||
      !isStringArray(record.expandedTaskIds) ||
      !isStringArray(record.expandedSubtaskIds)
    ) {
      return defaultUiState()
    }
    return normalizeUiState(record)
  } catch {
    return defaultUiState()
  }
}

export function persistUiState(uiState: UiState, userId?: string | null): void {
  if (typeof window === 'undefined' || !userId) {
    return
  }
  window.localStorage.setItem(storageKey(userId), JSON.stringify(normalizeUiState(uiState)))
}
