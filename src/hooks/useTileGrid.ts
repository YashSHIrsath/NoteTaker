import type { CSSProperties } from 'react'
import { useAuth } from './useAuth'
import { readTilesPerRow } from '../lib/viewStyle'
import { TASK_TILE_GRID } from '../components/task/AllTaskTile'

export interface TileGrid {
  className: string
  style: CSSProperties | undefined
}

/**
 * The class and style for a note-tile grid, honouring the account's "tiles per row" setting.
 *
 * On auto (the default) this is the width-driven auto-fill grid: columns appear as the space to
 * hold them appears. A fixed count overrides that with exactly that many equal columns at every
 * width — minmax(0, 1fr) rather than a minimum width, because the point of choosing a number is
 * that it's kept.
 */
export function useTileGrid(): TileGrid {
  const { user } = useAuth()
  const tilesPerRow = readTilesPerRow(user?.user_metadata as Record<string, unknown> | undefined)

  if (tilesPerRow === 'auto') {
    return { className: TASK_TILE_GRID, style: undefined }
  }
  return {
    className: 'mt-2 grid gap-2.5 sm:gap-3',
    style: { gridTemplateColumns: `repeat(${tilesPerRow}, minmax(0, 1fr))` },
  }
}
