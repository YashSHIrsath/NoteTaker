import { collectSubtaskSubtreeIds, getChildSubtasks } from '../../lib/subtasks'
import { isSubtaskExpandedInUi, normalizeUiState } from '../../repositories/supabase/uiStateStore'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

export function runTaskEditorChecks(): void {
  const parent = {
    id: 'parent',
    title: 'Learn React',
    taskId: 'task',
    parentSubtaskId: null,
    completed: false,
  }
  const child = {
    id: 'child',
    title: 'Components',
    taskId: 'task',
    parentSubtaskId: 'parent',
    completed: false,
  }
  const nested = {
    id: 'nested',
    title: 'Practice',
    taskId: 'task',
    parentSubtaskId: 'child',
    completed: false,
  }
  const sibling = {
    id: 'hooks',
    title: 'Hooks',
    taskId: 'task',
    parentSubtaskId: 'parent',
    completed: false,
  }
  const subtasks = [parent, child, nested, sibling]

  assert(getChildSubtasks(subtasks, 'parent').length === 2, 'parent has two children')
  assert(getChildSubtasks(subtasks, 'child')[0]?.id === 'nested', 'nested child stays under Components')
  const removed = new Set(collectSubtaskSubtreeIds(subtasks, 'child'))
  assert(removed.has('child') && removed.has('nested'), 'delete removes nested descendants')
  assert(!removed.has('hooks'), 'delete does not remove sibling subtasks')

  const ui = normalizeUiState({
    myNotesSidebarExpanded: true,
    expandedFolderIds: [],
    expandedTaskIds: [],
    expandedSubtaskIds: [],
  })
  assert(ui.collapsedSubtaskIds.length === 0, 'missing collapse list defaults to empty')
  assert(isSubtaskExpandedInUi(ui, 'parent'), 'subtasks are expanded by default')
  const collapsed = normalizeUiState({ ...ui, collapsedSubtaskIds: ['parent'] })
  assert(!isSubtaskExpandedInUi(collapsed, 'parent'), 'collapsed subtask stays collapsed')
  assert(isSubtaskExpandedInUi(collapsed, 'child'), 'other subtasks stay expanded')
}
