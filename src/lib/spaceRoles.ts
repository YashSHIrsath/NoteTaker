import type { SpaceRole } from '../types'

/** What each role is called on screen. */
export const ROLE_LABELS: Record<SpaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

/**
 * What each role can do, in the words of someone choosing between them.
 *
 * Written from the reader's side rather than the schema's: nobody picking a role is thinking about
 * `space_can_write`. The enforcement lives in the database — these sentences only have to be true.
 */
export const ROLE_SUMMARY: Record<SpaceRole, string> = {
  owner: 'Can do everything, including handing the space over or deleting it.',
  admin: 'Can edit everything and manage who is in the space.',
  editor: 'Can add, edit and delete notes and tasks.',
  viewer: 'Can read everything, and change nothing.',
}

/** Whether this role may change the space's contents. Mirrors public.space_can_write, and is only
 *  ever used to decide what to *show* — the database is what refuses the write. */
export function roleCanWrite(role: SpaceRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

/** Whether this role may invite, remove and re-role people. */
export function roleCanManageMembers(role: SpaceRole): boolean {
  return role === 'owner' || role === 'admin'
}
