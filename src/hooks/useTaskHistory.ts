import { useCallback, useEffect, useState } from 'react'
import type { TaskEvent } from '../types'
import { getRemindersRepository, RepositoryError } from '../repositories'

export interface TaskHistory {
  events: TaskEvent[]
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * One task's schedule history, fetched when it is actually looked at.
 *
 * Deliberately not part of the notes document or the app-wide reminder list. History is
 * append-only and unbounded — every deadline change, every fired reminder, forever — so loading it
 * with everything else would mean carrying rows nobody has asked to see. `enabled` is what makes
 * it cost nothing until the panel is open.
 *
 * `reloadKey` re-runs the fetch when something the log records happens (adding a reminder, moving
 * a deadline), because the rows are written by database triggers and never come back through the
 * write that caused them.
 */
export function useTaskHistory(taskId: string, enabled: boolean, reloadKey = 0): TaskHistory {
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualKey, setManualKey] = useState(0)

  const reload = useCallback(() => setManualKey((key) => key + 1), [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    void Promise.resolve(getRemindersRepository().listEvents(taskId))
      .then((rows) => {
        if (!cancelled) {
          setEvents(rows)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof RepositoryError ? cause.message : 'Could not load this note’s history.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [taskId, enabled, reloadKey, manualKey])

  return { events, loading, error, reload }
}
