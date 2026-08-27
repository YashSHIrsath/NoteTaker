import { useCallback, useState, type ReactElement } from 'react'
import { createElement } from 'react'
import type { Task } from '../types'
import { ReopenTaskDialog } from '../components/task/ReopenTaskDialog'
import { useFolders } from './useFolders'

/**
 * The tick, and the two questions that stand behind un-ticking.
 *
 * Every card, tile and note header shows the same status badge, so the guard has to live with the
 * *action* rather than with any one of them — the same reason useDeleteTask exists. Callers hand
 * over the toggle and render the `dialog` they get back; which of the three surfaces the click
 * came from stops mattering.
 *
 * Ticking a task off still happens on the click, with nothing in the way. Only the reverse asks,
 * because only the reverse destroys something (see ReopenTaskDialog).
 */
export function useTaskCompletion() {
  const { getTask, setTaskCompleted, updateTaskSchedule } = useFolders()
  const [reopening, setReopening] = useState<Task | null>(null)

  /** Ticks straight through; opens the two-step dialog when the click would un-tick. */
  const toggleCompleted = useCallback(
    (taskId: string) => {
      const task = getTask(taskId)
      if (!task) {
        return
      }
      if (!task.completed) {
        setTaskCompleted(taskId, true)
        return
      }
      setReopening(task)
    },
    [getTask, setTaskCompleted],
  )

  const confirmReopen = useCallback(
    (nextDueAt: string | null) => {
      const task = reopening
      setReopening(null)
      if (!task) {
        return
      }
      // Order matters: the deadline moves first, so the task is never momentarily reopened
      // against the old date — that intermediate state is exactly the "reopened straight into
      // overdue" the second question exists to prevent, and it would flash on the card.
      if (nextDueAt) {
        updateTaskSchedule(task.id, 'due_task', nextDueAt)
      }
      setTaskCompleted(task.id, false)
    },
    [reopening, setTaskCompleted, updateTaskSchedule],
  )

  // createElement rather than JSX: this is a .ts file, and giving it a .tsx extension for one
  // element would put a hook in the components tree for no reason.
  //
  // Keyed by task id, so the dialog is a fresh mount per task and its step and date field start
  // clean without an effect to clear them.
  const dialog: ReactElement | null = reopening
    ? createElement(ReopenTaskDialog, {
        key: reopening.id,
        open: true,
        task: reopening,
        onCancel: () => setReopening(null),
        onConfirm: confirmReopen,
      })
    : null

  return { toggleCompleted, dialog }
}
