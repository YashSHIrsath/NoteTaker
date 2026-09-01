import { useCallback } from 'react'
import { useFolders } from './useFolders'
import { useSpaces } from './useSpaces'

/**
 * Everything one "show me the latest" gesture should ask for.
 *
 * Three reads rather than one, because the three things that go stale on a screen are held by
 * different providers: the workspace itself, the reminders the scheduler stamps from outside the
 * browser, and the list of spaces — which is the whole content of one page and changes when
 * somebody else invites you.
 *
 * `allSettled`, so one failure doesn't cancel the other two. None of them reports an error upward:
 * a refresh that can't reach the server leaves the last good answer on screen, which is the right
 * thing to be looking at.
 */
export function useRefreshWorkspace(): () => Promise<void> {
  const { refreshNotes, refreshReminders } = useFolders()
  const { refresh: refreshSpaces } = useSpaces()

  return useCallback(async () => {
    await Promise.allSettled([refreshNotes(), refreshReminders(), refreshSpaces()])
  }, [refreshNotes, refreshReminders, refreshSpaces])
}
