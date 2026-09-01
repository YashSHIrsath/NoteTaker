import type { Folder, FolderNode, Task, TaskLifecycle } from '../types'
import { buildFolderForest, collectFolderSubtreeIds, getChildFolders } from './folders'
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

/* ----------------------------------------------------------------- where it lives
 *
 * The flat listings — Tasks and Starred — draw from the whole tree, which is what makes them
 * useful and also what makes them hard to read once there is a lot in them: every note in the
 * account, in one grid, with the folder it came from written in 11px at the bottom of the card. You
 * could narrow by type, by status and by tag, but not by the one thing the listing had actually
 * flattened away.
 *
 * A folder view needs none of this. It is already one folder, so the filter is only offered where
 * the listing spans several.
 */

/** One folder the filter can narrow to, and how many notes picking it would leave. */
export interface FolderFilterOption {
  id: string
  name: string
  /** Where it sits, as "Notes › Work" — empty for a root folder, whose trail says nothing. */
  trail: string
  /** Notes anywhere beneath it, which is what picking it shows. */
  count: number
}

/**
 * The notes in one folder — meaning in it or anywhere under it.
 *
 * The subtree rather than the folder alone, because that is what a person means by "the notes in
 * Work": a folder that holds only sub-folders would otherwise offer itself as a filter and then
 * empty the page. It is also the reading every other count in this file already uses — see
 * folderSummary.
 *
 * A folder id that no longer exists filters nothing rather than everything. A selection can outlive
 * the folder it names (someone deletes it, or a shared space removes it), and an empty page with no
 * visible cause is worse than the filter quietly standing down.
 */
export function filterByFolder(
  tasks: Task[],
  folders: Folder[],
  folderId: string | null,
): Task[] {
  if (!folderId || !folders.some((folder) => folder.id === folderId)) {
    return tasks
  }
  const scope = new Set(collectFolderSubtreeIds(folders, folderId))
  return tasks.filter((task) => scope.has(task.folderId))
}

/**
 * The folders worth offering, in the order the sidebar shows them.
 *
 * Tree order, not alphabetical: a parent sits directly above its children, so the list reads as the
 * tree somebody built rather than as a shuffled index of names. Folders with nothing beneath them
 * are left out entirely — an option that empties the page is not a filter.
 *
 * Counted from the notes handed in, so Starred offers only the folders that hold starred notes and
 * says how many. Two folders can share a name in different parts of the tree, which is what `trail`
 * is for.
 */
export function folderFilterOptions(folders: Folder[], tasks: Task[]): FolderFilterOption[] {
  const direct = new Map<string, number>()
  for (const task of tasks) {
    direct.set(task.folderId, (direct.get(task.folderId) ?? 0) + 1)
  }

  const forest = buildFolderForest(folders)
  const subtree = new Map<string, number>()
  const count = (node: FolderNode): number => {
    const total =
      (direct.get(node.id) ?? 0) + node.children.reduce((sum, child) => sum + count(child), 0)
    subtree.set(node.id, total)
    return total
  }
  for (const root of forest) {
    count(root)
  }

  const options: FolderFilterOption[] = []
  const walk = (node: FolderNode, trail: readonly string[]): void => {
    const total = subtree.get(node.id) ?? 0
    if (total > 0) {
      options.push({
        id: node.id,
        name: node.name,
        trail: trail.length === 0 ? '' : ['Notes', ...trail].join(' › '),
        count: total,
      })
    }
    for (const child of node.children) {
      walk(child, [...trail, node.name])
    }
  }
  for (const root of forest) {
    walk(root, [])
  }
  return options
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
  folder?: string | null,
): string {
  // A folder and a tag are both "and only these", so they read as one clause. Joined here rather
  // than templated into each sentence below, because either can be on without the other.
  const narrowed = [folder ? `in "${folder}"` : '', tag ? `under "${tag}"` : '']
    .filter(Boolean)
    .join(' ')

  if (status !== 'all') {
    const option = STATUS_FILTERS.find((item) => item.key === status)
    const line = option?.empty || 'Nothing here matches that status.'
    if (!narrowed) {
      return line
    }
    // Each status sentence ends "…here.", and "here in \"Work\"" says the same thing twice — the
    // clause being appended is a more precise "here", so it takes its place.
    return `${line.replace(/ here(?=\.)/, '').replace(/\.$/, '')} ${narrowed}.`
  }
  if (tag) {
    return folder ? `No notes tagged "${tag}" in "${folder}".` : `No notes tagged "${tag}" here.`
  }
  if (folder) {
    return `Nothing in "${folder}" yet.`
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
  /** The chosen folder's *name*, not its id — this is what the pill would spell out. */
  folder?: string | null,
): { label: string; activeCount: number } {
  const parts: string[] = []
  if (kind !== 'all') {
    parts.push(KIND_FILTERS.find((item) => item.key === kind)?.label ?? kind)
  }
  if (status !== 'all') {
    parts.push(STATUS_FILTERS.find((item) => item.key === status)?.short ?? status)
  }
  // Before the tag, because a folder is the coarser of the two and the pill only ever shows the
  // first name — "Work" is a more useful thing to read on a button than "invoices".
  if (folder) {
    parts.push(folder)
  }
  if (tag) {
    parts.push(tag)
  }
  return {
    label: parts.length === 0 ? 'Filter' : parts[0],
    activeCount: parts.length,
  }
}
