export type ViewStyle = 'professional' | 'clipboard'

export function readViewStyle(metadata: Record<string, unknown> | undefined): ViewStyle {
  return metadata?.view_style === 'clipboard' ? 'clipboard' : 'professional'
}

/** How many note tiles sit in a row: a fixed count, or "auto" to let the width decide. */
export type TilesPerRow = 'auto' | number

export const MIN_TILES_PER_ROW = 1
export const MAX_TILES_PER_ROW = 10

/**
 * Stored on the account (user metadata) rather than per device, because it's a taste about how
 * the grid should look, not about this screen. "auto" is the default and stays the recommendation:
 * it fits as many columns as the available width can actually carry.
 */
export function readTilesPerRow(metadata: Record<string, unknown> | undefined): TilesPerRow {
  const raw = metadata?.tiles_per_row
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(value)) {
    return 'auto'
  }
  if (value < MIN_TILES_PER_ROW || value > MAX_TILES_PER_ROW) {
    return 'auto'
  }
  return value
}
