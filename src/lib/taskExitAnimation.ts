const EXIT_DURATION_MS = 180

function motionIsReduced() {
  return (
    typeof window === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function taskElements(taskId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-task-id]')).filter(
    (element) => element.dataset.taskId === taskId,
  )
}

/**
 * Lets a card visibly leave the current view before its data is removed or moved elsewhere.
 * The marker sits on the card content rather than the grid cell: react-grid-layout owns a
 * transform on the cell, and replacing that transform would make the card jump.
 */
export async function performWithTaskExit<T>(taskId: string, action: () => Promise<T> | T): Promise<T> {
  if (typeof document === 'undefined' || motionIsReduced()) {
    return action()
  }

  const elements = taskElements(taskId)
  if (elements.length === 0) {
    return action()
  }

  elements.forEach((element) => element.classList.add('anim-task-exit'))
  await new Promise<void>((resolve) => window.setTimeout(resolve, EXIT_DURATION_MS))

  try {
    return await action()
  } catch (error) {
    // A failed delete should leave the card usable, instead of stranded invisible.
    elements.forEach((element) => element.classList.remove('anim-task-exit'))
    throw error
  }
}
