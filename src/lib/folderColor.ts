import type { Folder } from '../types'
import { getRootFolders } from './folders'

export const FOLDER_CATEGORIES = ['indigo', 'teal', 'amber', 'rose', 'emerald'] as const

export type FolderCategory = (typeof FOLDER_CATEGORIES)[number]

/** Root folders are assigned a stable color by position; nested folders inherit their root's category. */
export function getFolderCategory(rootIndex: number): FolderCategory {
  const index = ((rootIndex % FOLDER_CATEGORIES.length) + FOLDER_CATEGORIES.length) % FOLDER_CATEGORIES.length
  return FOLDER_CATEGORIES[index]
}

export function categoryVar(category: FolderCategory, variant: 'solid' | 'soft' | 'ink' | 'card' = 'solid'): string {
  const suffix = variant === 'solid' ? '' : `-${variant}`
  return `var(--cat-${category}${suffix})`
}

// Excludes 'indigo' — that's the app's own accent/pinned color, so reusing it for a random
// card would make an ordinary task look like it's pinned.
const SCATTER_CATEGORIES = FOLDER_CATEGORIES.filter((category) => category !== 'indigo')

/**
 * A stable, scattered color per id — for views (like a flat "all tasks" list) where grouping
 * by folder would leave everything the same color, unlike getRootCategoryForFolder which is
 * deliberately grouped by folder family.
 */
export function scatterCategoryForId(id: string): FolderCategory {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return SCATTER_CATEGORIES[hash % SCATTER_CATEGORIES.length]
}

/** Nested folders share their root ancestor's category, so a subtree always reads as one color. */
export function getRootCategoryForFolder(folders: Folder[], folderId: string): FolderCategory {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  let current = byId.get(folderId)
  while (current?.parentId) {
    current = byId.get(current.parentId)
  }
  if (!current) {
    return getFolderCategory(0)
  }
  const rootIndex = getRootFolders(folders).findIndex((folder) => folder.id === current!.id)
  return getFolderCategory(rootIndex < 0 ? 0 : rootIndex)
}
