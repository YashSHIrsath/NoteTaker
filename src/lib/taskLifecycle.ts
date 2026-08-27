import type { Task, TaskLifecycle } from '../types'

/**
 * What state a due-date task is in.
 *
 * This is the same ladder as `public.task_lifecycle` in the database, deliberately duplicated
 * rather than fetched: the UI needs an answer sixty times a minute for a live countdown, and a
 * round trip per tick would be absurd. Keeping them identical is what makes the duplicate safe —
 * if you change one, change the other.
 *
 * Every input except `now` is a column the server wrote. `completedAt` in particular is stamped
 * by a trigger and ignored when the browser sends it, so "completed on time" is not something a
 * client can talk itself into. `now` comes from lib/serverClock, not `Date.now()`.
 */
export function taskLifecycle(task: Task, now: number): TaskLifecycle {
  if (task.noteKind !== 'due_task' || !task.dueAt) {
    return 'note'
  }
  const due = new Date(task.dueAt).getTime()
  if (task.completed) {
    const completed = task.completedAt ? new Date(task.completedAt).getTime() : now
    return completed <= due ? 'completed_on_time' : 'completed_late'
  }
  return now > due ? 'overdue' : 'upcoming'
}

/**
 * The card colours for the four task states.
 *
 * Fixed, and deliberately outside the note palette: a task's colour is a readout, not a
 * decoration, and it would stop meaning anything the moment someone could set an overdue task to
 * mint green. Plain notes keep the full picker (see lib/taskColor) — that is the whole difference.
 *
 * Each state names CSS variables that already carry a light and a dark value, so the readout
 * survives a theme flip; a raw hex could not.
 */
export interface LifecycleStyle {
  /** Card fill. */
  card: string
  /** Text and icons that read on top of `card`. */
  ink: string
  /** The saturated form, for small solid marks. */
  solid: string
}

const LIFECYCLE_STYLES: Record<Exclude<TaskLifecycle, 'note'>, LifecycleStyle> = {
  // Not due yet: the neutral of the set, so a list of upcoming work doesn't shout.
  upcoming: {
    card: 'var(--task-slate-card)',
    ink: 'var(--task-slate-ink)',
    solid: 'var(--task-slate-solid)',
  },
  completed_on_time: {
    card: 'var(--task-emerald-card)',
    ink: 'var(--task-emerald-ink)',
    solid: 'var(--task-emerald-solid)',
  },
  overdue: {
    card: 'var(--task-rose-card)',
    ink: 'var(--task-rose-ink)',
    solid: 'var(--task-rose-solid)',
  },
  // Done, but late — amber rather than red: it is finished, which is not the same as failing.
  completed_late: {
    card: 'var(--task-amber-card)',
    ink: 'var(--task-amber-ink)',
    solid: 'var(--task-amber-solid)',
  },
}

/** Null for a plain note, which keeps its own colour instead. */
export function lifecycleStyle(lifecycle: TaskLifecycle): LifecycleStyle | null {
  return lifecycle === 'note' ? null : LIFECYCLE_STYLES[lifecycle]
}

export const LIFECYCLE_LABELS: Record<TaskLifecycle, string> = {
  note: 'Note',
  upcoming: 'Not due yet',
  completed_on_time: 'Completed on time',
  overdue: 'Overdue',
  completed_late: 'Completed late',
}

export function isTaskComplete(lifecycle: TaskLifecycle): boolean {
  return lifecycle === 'completed_on_time' || lifecycle === 'completed_late'
}
