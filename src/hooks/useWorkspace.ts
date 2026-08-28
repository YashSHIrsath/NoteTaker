import { useCallback, useContext, useMemo } from 'react'
import { WorkspaceContext } from '../context/WorkspaceContext'
import { spacePath, type WorkspaceRef } from '../lib/workspace'

export function useWorkspace(): WorkspaceRef {
  return useContext(WorkspaceContext)
}

/**
 * Turns a personal-app path into an address in the current workspace.
 *
 * Call it around every destination: `to('/folder/' + id)` is '/folder/x' in your own notes and
 * '/s/<space>/folder/x' inside a space. The alternative — every call site asking which workspace it
 * is in — is how half of them end up navigating out of the space they were in.
 */
export function useWorkspacePath(): (path: string) => string {
  const workspace = useWorkspace()
  return useCallback((path: string) => spacePath(workspace, path), [workspace])
}

/** True while the app is showing a shared space rather than your own notes. */
export function useIsSpace(): boolean {
  return useWorkspace().kind === 'space'
}

/** The current space's id, or null in personal notes. */
export function useSpaceId(): string | null {
  const workspace = useWorkspace()
  return useMemo(() => (workspace.kind === 'space' ? workspace.id : null), [workspace])
}
