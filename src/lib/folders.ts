import type { Folder, FolderNode } from '../types'

export function compareFoldersBySortOrder(a: Folder, b: Folder): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder
  }
  return a.id.localeCompare(b.id)
}

export function getFolderById(
  folders: Folder[],
  id: string,
): Folder | undefined {
  return folders.find((folder) => folder.id === id)
}

export function getChildFolders(
  folders: Folder[],
  parentId: string | null,
): Folder[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .slice()
    .sort(compareFoldersBySortOrder)
}

/** Top-level folders shown on MyNotes (`parentId` is null). */
export function getRootFolders(folders: Folder[]): Folder[] {
  return getChildFolders(folders, null)
}

export function isRootFolder(folder: Pick<Folder, 'parentId'>): boolean {
  return folder.parentId === null
}

export function getImportantFolders(folders: Folder[]): Folder[] {
  return folders.filter((folder) => folder.isImportant)
}

export function folderHasChildren(node: FolderNode): boolean {
  return node.children.length > 0
}

export function nextFolderSortOrder(folders: Folder[], parentId: string | null): number {
  const siblings = getChildFolders(folders, parentId)
  if (siblings.length === 0) {
    return 0
  }
  return Math.max(...siblings.map((folder) => folder.sortOrder)) + 1
}

export function reorderSiblingFolders(
  folders: Folder[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
): Folder[] {
  const dragged = getFolderById(folders, draggedId)
  const target = getFolderById(folders, targetId)

  if (!dragged || !target || dragged.id === target.id) {
    return folders
  }
  if (dragged.parentId !== target.parentId) {
    return folders
  }

  const siblings = getChildFolders(folders, dragged.parentId)
  const moving = siblings.find((folder) => folder.id === draggedId)
  if (!moving) {
    return folders
  }

  const rest = siblings.filter((folder) => folder.id !== draggedId)
  let insertAt = rest.findIndex((folder) => folder.id === targetId)
  if (insertAt < 0) {
    return folders
  }
  if (position === 'after') {
    insertAt += 1
  }
  rest.splice(insertAt, 0, moving)

  const orderById = new Map(rest.map((folder, index) => [folder.id, index]))
  return folders.map((folder) => {
    const sortOrder = orderById.get(folder.id)
    return sortOrder === undefined ? folder : { ...folder, sortOrder }
  })
}

export function collectFolderSubtreeIds(folders: Folder[], rootId: string): string[] {
  const ids = [rootId]
  for (const child of getChildFolders(folders, rootId)) {
    ids.push(...collectFolderSubtreeIds(folders, child.id))
  }
  return ids
}

export function getFolderPath(folders: Folder[], id: string): Folder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: Folder[] = []
  let current = byId.get(id)

  while (current) {
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return path
}

export function buildFolderForest(folders: Folder[]): FolderNode[] {
  const childrenByParent = new Map<string, Folder[]>()

  for (const folder of folders) {
    const key = folder.parentId ?? '__root__'
    const siblings = childrenByParent.get(key)
    if (siblings) {
      siblings.push(folder)
    } else {
      childrenByParent.set(key, [folder])
    }
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort(compareFoldersBySortOrder)
  }

  const toNode = (folder: Folder): FolderNode => ({
    ...folder,
    children: (childrenByParent.get(folder.id) ?? []).map(toNode),
  })

  return (childrenByParent.get('__root__') ?? []).map(toNode)
}
