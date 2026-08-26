export type ViewStyle = 'professional' | 'clipboard'

export function readViewStyle(metadata: Record<string, unknown> | undefined): ViewStyle {
  return metadata?.view_style === 'clipboard' ? 'clipboard' : 'professional'
}

/** How many note tiles sit in a row: a fixed count, or "auto" to let the width decide. */
export type TilesPerRow = 'auto' | number

export const MIN_TILES_PER_ROW = 1

/**
 * The screen sizes this setting is kept separately for, and the most cards each will carry.
 *
 * Fixed bands rather than a measurement. An earlier version worked the cap out from a minimum
 * readable tile width, the page gutter, the grid gap and the sidebar, which was defensible and
 * still produced counts nobody wanted: four columns on a large phone, ten on a desktop. These are
 * the counts a card actually stays worth reading at, decided once and stated plainly.
 *
 * Ordered narrowest first and matched on the first `below` a width falls under, so the last entry
 * is the open-ended one.
 */
export const TILE_BANDS = [
  { id: 'xs', below: 400, max: 1, label: 'Phone' },
  { id: 'sm', below: 500, max: 2, label: 'Large phone' },
  { id: 'md', below: 850, max: 3, label: 'Tablet' },
  { id: 'lg', below: Number.POSITIVE_INFINITY, max: 6, label: 'Desktop' },
] as const

export type TileBand = (typeof TILE_BANDS)[number]
export type TileBandId = TileBand['id']

export const MAX_TILES_PER_ROW = Math.max(...TILE_BANDS.map((band) => band.max))

/** Which band a viewport of this width is in. */
export function tileBandForWidth(viewportWidth: number): TileBand {
  return TILE_BANDS.find((band) => viewportWidth < band.below) ?? TILE_BANDS[TILE_BANDS.length - 1]
}

/** The most tiles-per-row this viewport can carry. Both the picker and the grid go through this,
 *  so the options offered are exactly the ones that work. */
export function maxTilesPerRowForWidth(viewportWidth: number): number {
  return tileBandForWidth(viewportWidth).max
}

/**
 * The metadata key a band's choice is stored under.
 *
 * One key per band, rather than one number for the account, because a grid that reads well on a
 * desktop is not the same grid that reads well on a phone — and picking 6 at a desk used to be
 * the same act as picking 6 on the phone in your pocket, where it could only ever be clamped back
 * down to 1. Each screen size now remembers what you asked for on that screen size.
 */
function bandKey(band: TileBandId): string {
  return `tiles_per_row_${band}`
}

/** The legacy account-wide key, still read as the starting point for a band nobody has set yet:
 *  a choice made before this was per-screen shouldn't silently reset to auto. Never written. */
const LEGACY_KEY = 'tiles_per_row'

function parseCount(raw: unknown): number | null {
  const value =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(value) || value < MIN_TILES_PER_ROW || value > MAX_TILES_PER_ROW) {
    return null
  }
  return value
}

/**
 * What this screen size is set to.
 *
 * Stored on the account rather than on the device, so it follows you between browsers — but
 * keyed by band, so the phone's answer and the desktop's answer are two different answers.
 */
export function readTilesPerRow(
  metadata: Record<string, unknown> | undefined,
  band: TileBandId,
): TilesPerRow {
  return parseCount(metadata?.[bandKey(band)]) ?? parseCount(metadata?.[LEGACY_KEY]) ?? 'auto'
}

/** The metadata patch that records a choice for one band. */
export function tilesPerRowUpdate(band: TileBandId, value: TilesPerRow): Record<string, string> {
  return { [bandKey(band)]: String(value) }
}
