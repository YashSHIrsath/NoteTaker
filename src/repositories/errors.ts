export class RepositoryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RepositoryError'
  }
}

function errorText(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return ''
}

export function isUnreachableError(error: unknown): boolean {
  const normalized = errorText(error).toLowerCase()
  return (
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('network request failed') ||
    normalized.includes('load failed') ||
    normalized.includes('err_network') ||
    normalized.includes('the internet connection appears to be offline')
  )
}

/**
 * The name of a column this database doesn't have, in whichever way it said so.
 *
 * A migration that hasn't been applied yet reports itself two different ways, and they arrive from
 * different layers. A *write* trips PostgREST's schema cache — PGRST204, "Could not find the 'x'
 * column of 'y' in the schema cache". A *read* gets all the way to Postgres and comes back as
 * 42703, "column folders.space_id does not exist". Only the first was recognised here, which meant
 * a filter on a column the database lacked was an unrecoverable load failure rather than something
 * to degrade around.
 *
 * Worth naming in both cases: a failed save is rolled back, so otherwise the only symptom is an
 * edit quietly reverting a moment later.
 */
export function missingColumnName(error: unknown): string | null {
  const text = errorText(error)
  const patterns = [
    /could not find the '([^']+)' column/i,
    /column\s+"?(\w+)"?\s+of relation/i,
    /column\s+(?:[\w"]+\.)?"?(\w+)"?\s+does not exist/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match) {
      return match[1] ?? null
    }
  }
  return null
}

export function toRepositoryError(error: unknown, fallback: string): RepositoryError {
  if (error instanceof RepositoryError) {
    return error
  }
  if (isUnreachableError(error)) {
    return new RepositoryError('Could not reach the server.', { cause: error })
  }
  const column = missingColumnName(error)
  if (column) {
    return new RepositoryError(
      `Your database is missing the "${column}" column — apply the pending migration (npm run db:push) and try again.`,
      { cause: error },
    )
  }
  return new RepositoryError(fallback, { cause: error })
}
