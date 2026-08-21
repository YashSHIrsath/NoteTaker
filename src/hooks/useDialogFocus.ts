import { useEffect, type RefObject } from 'react'

/** Focuses `targetRef` when a dialog opens and returns focus to the trigger when it closes. */
export function useDialogFocus(open: boolean, targetRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) {
      return
    }
    const trigger = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => targetRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      trigger?.focus?.()
    }
  }, [open, targetRef])
}
