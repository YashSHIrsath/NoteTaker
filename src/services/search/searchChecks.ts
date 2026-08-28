import { createDefaultSnapshot } from '../storage/defaults'
import { searchNotes, normalizeSearchQuery, textMatches } from './searchNotes'
import { collectSubtaskAncestorIds } from '../../lib/subtasks'
import type { Folder, Subtask, Task } from '../../types'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

export function runSearchChecks(): void {
  assert(normalizeSearchQuery('  React  ') === 'react', 'queries are trimmed and lowercased')
  assert(searchNotes('   ', { folders: [], tasks: [], subtasks: [] }).length === 0, 'empty query has no results')
  assert(textMatches('Learn React Hooks', 'react'), 'matching is case-insensitive substring')

  const folders: Folder[] = [
    { id: 'prog', name: 'Programming', parentId: null, isImportant: false, sortOrder: 0 },
    { id: 'web', name: 'Web Development', parentId: 'prog', isImportant: false, sortOrder: 0 },
    { id: 'react-folder', name: 'React', parentId: 'web', isImportant: false, sortOrder: 0 },
  ]
  const tasks: Task[] = [
    {
      id: 'hooks',
      title: 'Learn React Hooks',
      folderId: 'react-folder',
      content: 'Building a React application',
      isImportant: true,
      pinnedScopes: [],
      noteKind: 'note',
      dueAt: null,
      completed: false,
      completedAt: null,
      tags: [],
      color: null,
      gridLayouts: null,
      sortOrder: 0,
    },
  ]
  const subtasks: Subtask[] = [
    { id: 'parent', title: 'Hooks', taskId: 'hooks', parentSubtaskId: null, completed: false },
    { id: 'effect', title: 'Practice useEffect', taskId: 'hooks', parentSubtaskId: 'parent', completed: false },
  ]

  const rootHit = searchNotes('programming', { folders, tasks, subtasks })
  assert(rootHit[0]?.kind === 'folder' && rootHit[0].href === '/folder/prog', 'root folder is searchable')
  assert(rootHit[0]?.pathLabel === '', 'root folder has no ancestor path')

  const nested = searchNotes('web', { folders, tasks, subtasks })
  assert(nested.some((item) => item.id === 'web' && item.pathLabel === 'Programming'), 'nested folder shows ancestor path')

  const deep = searchNotes('react', { folders, tasks, subtasks })
  assert(deep.some((item) => item.id === 'react-folder'), 'nested folder name matches')
  assert(deep.some((item) => item.id === 'hooks' && item.kind === 'task'), 'task title matches')
  assert(
    deep.some((item) => item.kind === 'task' && item.pathLabel === 'Programming → Web Development → React'),
    'task result includes folder path',
  )
  assert(
    deep.some((item) => item.kind === 'task' && item.href === '/folder/react-folder' && item.taskId === 'hooks'),
    'task result opens its folder and carries the task id to reopen its popup',
  )

  const contentHit = searchNotes('application', { folders, tasks, subtasks })
  assert(contentHit.some((item) => item.id === 'hooks'), 'task content is searchable')

  const subHit = searchNotes('useeffect', { folders, tasks, subtasks })
  assert(subHit[0]?.kind === 'subtask' && subHit[0].href === '/folder/react-folder', 'subtask opens its task\'s folder')
  assert(subHit[0]?.taskId === 'hooks', 'subtask result carries its task id to reopen the popup')
  assert(subHit[0]?.revealSubtaskId === 'effect', 'subtask result carries reveal id')
  assert(subHit[0]?.pathLabel === 'Learn React Hooks', 'subtask shows the task title')

  assert(searchNotes('zzz', { folders, tasks, subtasks }).length === 0, 'unmatched query returns no results')
  assert(collectSubtaskAncestorIds(subtasks, 'effect')[0] === 'parent', 'nested subtask ancestors are collected')

  const emptyUser = createDefaultSnapshot()
  assert(
    searchNotes('react', {
      folders: emptyUser.folders,
      tasks: emptyUser.tasks,
      subtasks: emptyUser.subtasks,
    }).length === 0,
    'search only uses the loaded user snapshot',
  )
}
