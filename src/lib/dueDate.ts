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

export function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}
