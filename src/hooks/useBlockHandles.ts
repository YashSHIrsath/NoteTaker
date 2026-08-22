import { useCallback, useState } from 'react'

const STORAGE_KEY = 'mynotes-block-handles'

/**
 * Whether the note editor shows BlockNote's gutter controls (the "+" and the drag handle).
 *
 * Off, the editor reclaims the 54px gutter those controls need, so text starts at the edge of its
 * box instead of leaving a wide empty margin — blocks are then added and changed with BlockNote's
 * own "/" menu, which works either way.
 *
 * A device preference rather than an account one: it's about how you like to edit on *this*
 * screen (a mouse can hover for a handle, a phone mostly can't), so it lives in localStorage.
 */
export function useBlockHandles(): { enabled: boolean; toggle: () => void } {
  const [enabled, setEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* a blocked storage just means the choice doesn't outlive the session */
      }
      return next
    })
  }, [])

  return { enabled, toggle }
}
