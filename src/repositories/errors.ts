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

export function toRepositoryError(error: unknown, fallback: string): RepositoryError {
  if (error instanceof RepositoryError) {
    return error
  }
  if (isUnreachableError(error)) {
    return new RepositoryError('Could not reach the server.', { cause: error })
  }
  return new RepositoryError(fallback, { cause: error })
}
