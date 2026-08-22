import type { TaskStatus } from '../types'

export const STATUS_ORDER: TaskStatus[] = ['pending', 'ongoing', 'complete']

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Incomplete',
  ongoing: 'Ongoing',
  complete: 'Complete',
}

export function nextTaskStatus(status: TaskStatus): TaskStatus {
  const index = STATUS_ORDER.indexOf(status)
  return STATUS_ORDER[(index + 1) % STATUS_ORDER.length]
}
