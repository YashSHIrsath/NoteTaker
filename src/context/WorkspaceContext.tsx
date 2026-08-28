import { createContext, type ReactNode } from 'react'
import { PERSONAL_WORKSPACE, type WorkspaceRef } from '../lib/workspace'

/**
 * Which workspace everything below is looking at.
 *
 * Deliberately a context of its own rather than a field on FolderContext, and above it in the tree:
 * FolderProvider needs the answer in order to decide what to load, so it cannot also be the thing
 * that supplies it. Defaults to personal, which is what every route outside /s/:spaceId is.
 *
 * The hooks that read it live in hooks/useWorkspace, following the same split as useFolders and
 * useAuth.
 */
export const WorkspaceContext = createContext<WorkspaceRef>(PERSONAL_WORKSPACE)

export function WorkspaceProvider({
  workspace,
  children,
}: {
  workspace: WorkspaceRef
  children: ReactNode
}) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>
}
