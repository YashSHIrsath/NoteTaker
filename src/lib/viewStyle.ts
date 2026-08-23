export type ViewStyle = 'professional' | 'clipboard'

export function readViewStyle(metadata: Record<string, unknown> | undefined): ViewStyle {
  return metadata?.view_style === 'clipboard' ? 'clipboard' : 'professional'
}

/** How many note tiles sit in a row: a fixed count, or "auto" to let the width decide. */
export type TilesPerRow = 'auto' | number

export const MIN_TILES_PER_ROW = 1
export const MAX_TILES_PER_ROW = 10

/**
 * Narrowest a note tile can be and still be worth having. Below this the title truncates to a
 * couple of characters and the content preview is gone, so the tile carries no information — the
 * grid looks denser while telling you less.
 *
 * Lower than the auto grid's own 150px minimum on purpose: auto is choosing what's *comfortable*,
 * while this is the floor on what's *legible*. Picking a fixed count is a deliberate ask for a
 * tighter grid, so it's allowed past comfortable — just not past useless.
 */
export const MIN_READABLE_TILE_PX = 112

/* The geometry the tile grids actually sit in: the page's own gutter (px-4, px-6 from sm), the
   grid's gap (gap-2.5, gap-3 from sm) and, from lg, the sidebar beside it. Taken from
   AllTasksPage/ImportantPage's scroll container and TASK_TILE_GRID; none of those containers caps
   its width, so the viewport is the only other input. The expanded sidebar width is used rather
   than the collapsed one, so the cap is a number that holds either way. */
const GUTTER_PX = { compact: 32, wide: 48 }
const GAP_PX = { compact: 10, wide: 12 }
const SIDEBAR_PX = 264
const SM_BREAKPOINT = 640
const LG_BREAKPOINT = 1024

/**
 * The highest tiles-per-row this viewport can carry without the tiles becoming unreadable.
 *
 * Both the picker and the grid go through this, so the options offered are exactly the ones that
 * work — and an account that picked 10 on a desktop degrades to whatever its phone can hold
 * instead of rendering ten 30px slivers.
 */
export function maxTilesPerRowForWidth(viewportWidth: number): number {
  const wide = viewportWidth >= SM_BREAKPOINT
  const gutter = wide ? GUTTER_PX.wide : GUTTER_PX.compact
  const gap = wide ? GAP_PX.wide : GAP_PX.compact
  const sidebar = viewportWidth >= LG_BREAKPOINT ? SIDEBAR_PX : 0
  const content = viewportWidth - sidebar - gutter
  // n tiles need n minimums and n-1 gaps; adding one gap to both sides turns that into a division.
  const fits = Math.floor((content + gap) / (MIN_READABLE_TILE_PX + gap))
  return Math.min(MAX_TILES_PER_ROW, Math.max(MIN_TILES_PER_ROW, fits))
}

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
