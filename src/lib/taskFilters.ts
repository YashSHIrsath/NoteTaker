import type { Folder, Task, TaskLifecycle } from '../types'
import { collectFolderSubtreeIds, getChildFolders } from './folders'
import { taskLifecycle } from './taskLifecycle'

/**
 * The two questions every listing of notes now lets you ask: *what is this* and *where has it
 * got to*.
 *
 * They live here rather than next to one page's markup because they were only ever on two of the
 * five places notes are listed — the folder view and the flat Tasks page — so "show me what's
 * overdue" was a question you could only ask if you happened to be standing in the right room.
 * One module of pure functions, one filter bar over it, and every listing answers the same way.
 *
 * Nothing here stores anything. A task's state is derived from the columns the server wrote and
 * the clock (see lib/taskLifecycle), so a filter is a predicate over that derivation, never a
 * flag someone has to remember to keep up to date.
 */

export const KIND_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Due-date' },
] as const

export type KindFilter = (typeof KIND_FILTERS)[number]['key']

/**
 * The status filter's options, in the order they read as a ladder: everything, then the two
 * unfinished states, then the three finished ones.
 *
 * `label` is what the menu spells out; `short` is what the closed pill can fit. "Completed on
 * time" and "Completed late" are the "before and after the due date" halves — they are the whole
 * reason `completedAt` is stamped by the server, and until now nothing in the UI let you list
 * them separately.
 */
export const STATUS_FILTERS = [
  { key: 'all', label: 'Any status', short: 'Status', empty: '' },
  { key: 'incomplete', label: 'Incomplete', short: 'Incomplete', empty: 'Nothing unfinished here.' },
  {
    key: 'upcoming',
    label: 'Not due yet',
    short: 'Not due yet',
    empty: 'No deadlines still ahead here.',
  },
  { key: 'overdue', label: 'Overdue', short: 'Overdue', empty: 'Nothing is overdue here.' },
  { key: 'completed', label: 'Completed', short: 'Completed', empty: 'Nothing completed here yet.' },
  {
    key: 'on_time',
    label: 'Completed on time',
    short: 'On time',
    empty: 'Nothing was finished before its deadline here.',
  },
  {
    key: 'late',
    label: 'Completed late',
    short: 'Late',
    empty: 'Nothing was finished after its deadline here.',
  },
] as const

export type StatusFilter = (typeof STATUS_FILTERS)[number]['key']

const STATUS_FILTER_KEYS = STATUS_FILTERS.map((option) => option.key)

/** What a status option means, as a predicate over the derived lifecycle. */
export function matchesStatus(lifecycle: TaskLifecycle, status: StatusFilter): boolean {
  switch (status) {
    case 'all':
      return true
    case 'incomplete':
      return lifecycle === 'upcoming' || lifecycle === 'overdue'
    case 'upcoming':
      return lifecycle === 'upcoming'
    case 'overdue':
      return lifecycle === 'overdue'
    case 'completed':
      return lifecycle === 'completed_on_time' || lifecycle === 'completed_late'
    case 'on_time':
      return lifecycle === 'completed_on_time'
    case 'late':
      return lifecycle === 'completed_late'
  }
}

export function filterByKind(tasks: Task[], kind: KindFilter): Task[] {
  if (kind === 'all') {
    return tasks
  }
  return tasks.filter((task) =>
    kind === 'tasks' ? task.noteKind === 'due_task' : task.noteKind !== 'due_task',
  )
}

/**
 * Notes drop out of every status except "any", and that is deliberate rather than an oversight:
 * a plain note has no deadline to be early or late for, so listing it under "Completed on time"
 * would be inventing a fact about it.
 */
export function filterByStatus(tasks: Task[], status: StatusFilter, nowMs: number): Task[] {
  if (status === 'all') {
    return tasks
  }
  return tasks.filter((task) => matchesStatus(taskLifecycle(task, nowMs), status))
}

export function applyTaskFilters(
  tasks: Task[],
  kind: KindFilter,
  status: StatusFilter,
  nowMs: number,
): Task[] {
  return filterByStatus(filterByKind(tasks, kind), status, nowMs)
}

/** How many notes each option would leave on screen — shown beside it, so picking a filter that
 *  empties the page is a choice rather than a surprise. */
export function statusCounts(tasks: Task[], nowMs: number): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: tasks.length,
    incomplete: 0,
    upcoming: 0,
    overdue: 0,
    completed: 0,
    on_time: 0,
    late: 0,
  }
  for (const task of tasks) {
    const lifecycle = taskLifecycle(task, nowMs)
    if (lifecycle === 'note') {
      continue
    }
    for (const key of STATUS_FILTER_KEYS) {
      if (key !== 'all' && matchesStatus(lifecycle, key)) {
        counts[key] += 1
      }
    }
  }
  return counts
}

export function kindCounts(tasks: Task[]): Record<KindFilter, number> {
  const dueTasks = tasks.filter((task) => task.noteKind === 'due_task').length
  return { all: tasks.length, notes: tasks.length - dueTasks, tasks: dueTasks }
}

/** Everything the Tree's readout needs, counted in one pass over the workspace. */
export interface TaskStats {
  total: number
  notes: number
  tracked: number
  upcoming: number
  overdue: number
  completedOnTime: number
  completedLate: number
  completed: number
  incomplete: number
  important: number
  /** Completed tracked tasks as a 0–1 share of all tracked tasks; 0 when there are none. */
  completionRatio: number
}

export function taskStats(tasks: Task[], nowMs: number): TaskStats {
  const stats: TaskStats = {
    total: tasks.length,
    notes: 0,
    tracked: 0,
    upcoming: 0,
    overdue: 0,
    completedOnTime: 0,
    completedLate: 0,
    completed: 0,
    incomplete: 0,
    important: 0,
    completionRatio: 0,
  }
  for (const task of tasks) {
    if (task.isImportant) {
      stats.important += 1
    }
    switch (taskLifecycle(task, nowMs)) {
      case 'note':
        stats.notes += 1
        break
      case 'upcoming':
        stats.upcoming += 1
        break
      case 'overdue':
        stats.overdue += 1
        break
      case 'completed_on_time':
        stats.completedOnTime += 1
        break
      case 'completed_late':
        stats.completedLate += 1
        break
    }
  }
  stats.tracked = stats.total - stats.notes
  stats.completed = stats.completedOnTime + stats.completedLate
  stats.incomplete = stats.upcoming + stats.overdue
  stats.completionRatio = stats.tracked === 0 ? 0 : stats.completed / stats.tracked
  return stats
}

/**
 * The unfinished deadlines, soonest first — the queue the Tree's spotlight reads from.
 *
 * Overdue tasks sort to the front for free, because "soonest first" on an absolute timestamp puts
 * a deadline that has already gone by ahead of one that hasn't. That is the right order: the thing
 * you are already late for is not less urgent than the thing you are not late for yet.
 */
export function deadlineQueue(tasks: Task[], nowMs: number): Task[] {
  return tasks
    .filter((task) => {
      const lifecycle = taskLifecycle(task, nowMs)
      return lifecycle === 'upcoming' || lifecycle === 'overdue'
    })
    .sort((a, b) => new Date(a.dueAt ?? 0).getTime() - new Date(b.dueAt ?? 0).getTime())
}

/** What a folder row can say about itself without being opened. */
export interface FolderSummary {
  /** Folders directly inside it. Not the whole subtree — that number means nothing to a reader. */
  subfolders: number
  /** Notes anywhere beneath it, which is what "how much is in here" actually means. */
  notes: number
  overdue: number
  /** Unfinished deadlines inside the next day. */
  dueSoon: number
}

/**
 * The counts under a folder's name on the Notes page.
 *
 * A root folder row used to be a name and nothing else, which made the page a list of words with
 * no way to tell a folder holding sixty notes and four overdue deadlines from an empty one. Every
 * number here already existed; none of it was ever shown at the level where you choose which
 * folder to open.
 */
export function folderSummary(
  folders: Folder[],
  tasks: Task[],
  folderId: string,
  nowMs: number,
): FolderSummary {
  const subtree = new Set(collectFolderSubtreeIds(folders, folderId))
  const summary: FolderSummary = {
    subfolders: getChildFolders(folders, folderId).length,
    notes: 0,
    overdue: 0,
    dueSoon: 0,
  }
  for (const task of tasks) {
    if (!subtree.has(task.folderId)) {
      continue
    }
    summary.notes += 1
    const lifecycle = taskLifecycle(task, nowMs)
    if (lifecycle === 'overdue') {
      summary.overdue += 1
    } else if (lifecycle === 'upcoming' && deadlineUrgency(task, nowMs) === 'soon') {
      summary.dueSoon += 1
    }
  }
  return summary
}

/**
 * How loudly the spotlight should announce a deadline.
 *
 * Three steps rather than a continuous scale: a bar whose animation speed creeps up over two days
 * is a bar nobody notices changing. "Already late", "due today", and "not yet" are the
 * distinctions a person actually acts on.
 */
export type DeadlineUrgency = 'overdue' | 'soon' | 'ahead'

const SOON_MS = 24 * 60 * 60 * 1000

export function deadlineUrgency(task: Task, nowMs: number): DeadlineUrgency {
  const due = new Date(task.dueAt ?? 0).getTime()
  if (due <= nowMs) {
    return 'overdue'
  }
  return due - nowMs <= SOON_MS ? 'soon' : 'ahead'
}

/**
 * The line a listing shows when the filters have emptied it.
 *
 * Each status carries its own sentence rather than being slotted into one template — "Nothing
 * here is not due yet" is what a template produces, and it is barely English.
 */
export function emptyFilterMessage(
  kind: KindFilter,
  status: StatusFilter,
  fallback: string,
  tag?: string | null,
): string {
  if (status !== 'all') {
    const option = STATUS_FILTERS.find((item) => item.key === status)
    const line = option?.empty || 'Nothing here matches that status.'
    return tag ? `${line.replace(/\.$/, '')} under "${tag}".` : line
  }
  if (tag) {
    return `No notes tagged "${tag}" here.`
  }
  if (kind === 'tasks') {
    return 'No due-date tasks here — use the clock button on a note to give it a deadline.'
  }
  if (kind === 'notes') {
    return 'No plain notes here.'
  }
  return fallback
}

/**
 * What the closed filter pill says, and how many facets are on.
 *
 * The pill has to answer "is anything filtered, and roughly what" in the width of a button. One
 * facet gets its own name; more than one gets the first name and a count, because three names
 * side by side is the row this control exists to get rid of.
 */
export function filterSummary(
  kind: KindFilter,
  status: StatusFilter,
  tag: string | null,
): { label: string; activeCount: number } {
  const parts: string[] = []
  if (kind !== 'all') {
    parts.push(KIND_FILTERS.find((item) => item.key === kind)?.label ?? kind)
  }
  if (status !== 'all') {
    parts.push(STATUS_FILTERS.find((item) => item.key === status)?.short ?? status)
  }
  if (tag) {
    parts.push(tag)
  }
  return {
    label: parts.length === 0 ? 'Filter' : parts[0],
    activeCount: parts.length,
  }
}
