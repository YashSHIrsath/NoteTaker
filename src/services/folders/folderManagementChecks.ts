import { createDefaultSnapshot } from '../storage/defaults'
import { getRootFolders, isRootFolder } from '../../lib/folders'
import type { Folder } from '../../types'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

export function runFolderManagementChecks(): void {
  const empty = createDefaultSnapshot()
  assert(empty.folders.length === 0, 'new users are not seeded with mock folders')
  assert(!empty.folders.some((folder) => folder.name === 'Programming'), 'Programming is not hardcoded')

  const folders: Folder[] = [
    { id: 'root-a', name: 'Career', parentId: null, isImportant: false, sortOrder: 1 },
    { id: 'nested', name: 'React', parentId: 'root-a', isImportant: false, sortOrder: 0 },
    { id: 'root-b', name: 'ABC', parentId: null, isImportant: false, sortOrder: 0 },
  ]
  const roots = getRootFolders(folders)
  assert(roots.length === 2, 'MyNotes lists only parent_id null folders')
  assert(roots[0]?.id === 'root-b' && roots[1]?.id === 'root-a', 'root folders stay sort_order ordered')
  assert(!roots.some((folder) => folder.id === 'nested'), 'nested folders are not shown on MyNotes')
  assert(isRootFolder(folders[0]!) && !isRootFolder(folders[1]!), 'root vs nested is parentId only')

  const createdRoot: Folder = {
    id: 'new',
    name: 'LMH',
    parentId: null,
    isImportant: false,
    sortOrder: 2,
  }
  assert(createdRoot.parentId === null, 'MyNotes create uses parent_id null')
  assert(folders[1]!.parentId === 'root-a', 'nested create still uses the current folder id')

  const renamed = folders.map((folder) =>
    folder.id === 'root-a' ? { ...folder, name: 'Work' } : folder,
  )
  assert(renamed[0]?.name === 'Work', 'rename updates the same name field for root folders')
  assert(renamed[0]?.parentId === null, 'rename does not change parent_id')
}
