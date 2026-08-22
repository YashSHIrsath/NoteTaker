/** Focuses and selects a freshly-created task's title input, once it mounts. */
export function focusTaskTitle(taskId: string): void {
  requestAnimationFrame(() => {
    const node = document.getElementById(`task-title-${taskId}`)
    if (node instanceof HTMLInputElement) {
      node.focus()
      node.select()
    }
  })
}
