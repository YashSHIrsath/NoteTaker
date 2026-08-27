export function formatDueDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/* isOverdue used to live here and read `Date.now()`. Overdue is no longer a question the device
   clock answers on its own — it is one rung of the lifecycle ladder, measured against server time.
   See lib/taskLifecycle.ts. */
