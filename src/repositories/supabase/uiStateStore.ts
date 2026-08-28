import { PERSONAL_WORKSPACE, workspaceKey, type WorkspaceRef } from '../../lib/workspace'
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

/**
 * Which expand/collapse state this is, per account and per workspace.
 *
 * The personal key is deliberately unchanged from before spaces existed, so nobody's open folders
 * close on the deploy. A space gets a suffix, because "which folders are open" is a per-device
 * answer about one tree — sharing one set between your own notes and a shared space would have your
 * tree's open folders decide a space's, and both would fight over the same list.
 */
function storageKey(userId?: string | null, workspace: WorkspaceRef = PERSONAL_WORKSPACE): string {
  if (!userId) {
    return UI_STATE_KEY
  }
  const scope = workspaceKey(workspace)
  return scope === 'personal' ? `${UI_STATE_KEY}:${userId}` : `${UI_STATE_KEY}:${userId}:${scope}`
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

export function loadPersistedUiState(
  userId?: string | null,
  workspace: WorkspaceRef = PERSONAL_WORKSPACE,
): UiState {
  if (typeof window === 'undefined') {
    return defaultUiState()
  }

  try {
    // The unkeyed fallback is for state written before this store was keyed by account at all. It
    // is personal state by definition, so a space never reaches for it.
    const legacy =
      userId && workspace.kind === 'personal' ? window.localStorage.getItem(UI_STATE_KEY) : null
    const raw = window.localStorage.getItem(storageKey(userId, workspace)) ?? legacy
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

export function persistUiState(
  uiState: UiState,
  userId?: string | null,
  workspace: WorkspaceRef = PERSONAL_WORKSPACE,
): void {
  if (typeof window === 'undefined' || !userId) {
    return
  }
  window.localStorage.setItem(
    storageKey(userId, workspace),
    JSON.stringify(normalizeUiState(uiState)),
  )
}
