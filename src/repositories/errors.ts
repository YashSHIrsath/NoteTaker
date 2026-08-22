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
 * PostgREST reports a column the API's schema cache doesn't know as PGRST204 ("Could not find
 * the 'x' column of 'y' in the schema cache") — in practice, a migration that hasn't been
 * applied to this database yet. Worth naming: the save is rolled back when it fails, so
 * otherwise the only symptom is the edit quietly reverting a moment later.
 */
export function missingColumnName(error: unknown): string | null {
  const text = errorText(error)
  const match = /could not find the '([^']+)' column/i.exec(text)
  return match ? match[1] : null
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
