import {
  emptyFilterMessage,
  filterByFolder,
  filterSummary,
  folderFilterOptions,
} from '../../lib/taskFilters'
import type { Folder, Task } from '../../types'

/**
 * The folder filter, which is the one narrowing in this menu that has to understand the tree.
 *
 * Type, status and tag are each a property of one note. "Which folder" is not: a folder holds
 * sub-folders, so picking one has to mean the subtree — otherwise a folder that holds only
 * sub-folders offers itself as a filter and then empties the page.
 */

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function folder(id: string, name: string, parentId: string | null, sortOrder = 0): Folder {
  return { id, name, parentId, isImportant: false, sortOrder }
}

function note(id: string, folderId: string): Task {
  return {
    id,
    title: id,
    folderId,
    content: '',
    isImportant: false,
    pinnedScopes: [],
    sortOrder: 0,
    gridLayouts: null,
    noteKind: 'note',
    dueAt: null,
    completed: false,
    completedAt: null,
    tags: [],
    color: null,
  }
}

/**
 *   Work            (no notes of its own)
 *     Invoices      1
 *     Archive       1
 *   Home            1
 *     Archive       0   <- same name as Work › Archive, and empty
 */
const FOLDERS: Folder[] = [
  folder('work', 'Work', null, 0),
  folder('invoices', 'Invoices', 'work', 0),
  folder('work-archive', 'Archive', 'work', 1),
  folder('home', 'Home', null, 1),
  folder('home-archive', 'Archive', 'home', 0),
]

const NOTES: Task[] = [
  note('n1', 'invoices'),
  note('n2', 'work-archive'),
  note('n3', 'home'),
]

function checkFolderScopeIsTheSubtree(): void {
  assert(
    filterByFolder(NOTES, FOLDERS, 'work')
      .map((task) => task.id)
      .join(',') === 'n1,n2',
    'picking a folder shows what is under it, not only what is directly in it',
  )
  assert(
    filterByFolder(NOTES, FOLDERS, 'invoices')
      .map((task) => task.id)
      .join(',') === 'n1',
    'and picking the sub-folder narrows to just that',
  )
  assert(filterByFolder(NOTES, FOLDERS, null) === NOTES, 'no folder chosen filters nothing at all')
  assert(
    filterByFolder(NOTES, FOLDERS, 'deleted-folder') === NOTES,
    'a folder that no longer exists stands the filter down rather than emptying the page',
  )
}

function checkOptionsAreOfferedInTreeOrder(): void {
  const options = folderFilterOptions(FOLDERS, NOTES)

  assert(
    options.map((option) => option.id).join(',') === 'work,invoices,work-archive,home',
    'offered in tree order — a parent directly above its own children — and only where there is something to show',
  )
  assert(
    options.every((option) => option.id !== 'home-archive'),
    'an empty folder is not offered, because picking it could only empty the page',
  )

  const byId = new Map(options.map((option) => [option.id, option]))
  assert(byId.get('work')!.count === 2, 'a folder counts everything beneath it')
  assert(byId.get('invoices')!.count === 1, 'and a leaf counts its own')
  assert(byId.get('work')!.trail === '', 'a root folder has no trail worth showing')
  assert(
    byId.get('work-archive')!.trail === 'Notes › Work',
    'a nested one says where it lives, which is the only thing telling two Archives apart',
  )

  assert(
    folderFilterOptions(FOLDERS, []).length === 0,
    'a listing with no notes offers no folders, so the section stays shut',
  )
}

/** The pill has one line to say what is on. A folder outranks a tag on it, being the coarser of
 *  the two, and both count towards the badge. */
function checkSummaryCountsTheFolder(): void {
  assert(filterSummary('all', 'all', null, null).activeCount === 0, 'nothing on is nothing on')
  const withFolder = filterSummary('all', 'all', null, 'Work')
  assert(withFolder.activeCount === 1 && withFolder.label === 'Work', 'a folder alone names itself')
  const withBoth = filterSummary('all', 'all', 'invoices', 'Work')
  assert(
    withBoth.activeCount === 2 && withBoth.label === 'Work',
    'with a tag as well, the badge counts two and the folder is the name shown',
  )
}

/** The line a listing shows once the filters have emptied it. Each status sentence ends "…here.",
 *  and the folder clause is a more precise "here" — so it replaces it rather than following it. */
function checkEmptyMessageNamesTheFolder(): void {
  assert(
    emptyFilterMessage('all', 'overdue', 'fallback', null, null) === 'Nothing is overdue here.',
    'unchanged when no folder is chosen',
  )
  assert(
    emptyFilterMessage('all', 'overdue', 'fallback', null, 'Work') ===
      'Nothing is overdue in "Work".',
    'and says which folder when one is',
  )
  assert(
    emptyFilterMessage('all', 'overdue', 'fallback', 'invoices', 'Work') ===
      'Nothing is overdue in "Work" under "invoices".',
    'both narrowings read as one clause',
  )
  assert(
    emptyFilterMessage('all', 'all', 'fallback', null, 'Work') === 'Nothing in "Work" yet.',
    'a folder on its own gets its own sentence rather than the page fallback',
  )
  assert(
    emptyFilterMessage('all', 'all', 'fallback', null, null) === 'fallback',
    'and with nothing on, the page says its own thing',
  )
}

export function runTaskFilterChecks(): void {
  checkFolderScopeIsTheSubtree()
  checkOptionsAreOfferedInTreeOrder()
  checkSummaryCountsTheFolder()
  checkEmptyMessageNamesTheFolder()
}
