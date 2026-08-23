import { useEffect, useState, type CSSProperties } from 'react'
import { useAuth } from './useAuth'
import { maxTilesPerRowForWidth, readTilesPerRow } from '../lib/viewStyle'
import { TASK_TILE_GRID } from '../components/task/AllTaskTile'

export interface TileGrid {
  className: string
  style: CSSProperties | undefined
}

/** Live viewport width. The tile cap moves with it — a rotated phone or a resized window changes
 *  how many columns can hold a readable tile, so the answer can't be read once at mount. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

/**
 * The most columns this screen can carry before tiles stop being readable. Drives both the grid
 * below and the picker in Settings, so what's offered and what's rendered agree.
 */
export function useMaxTilesPerRow(): number {
  return maxTilesPerRowForWidth(useViewportWidth())
}

/**
 * The class and style for a note-tile grid, honouring the account's "tiles per row" setting.
 *
 * On auto (the default) this is the width-driven auto-fill grid: columns appear as the space to
 * hold them appears. A fixed count overrides that with exactly that many equal columns — but
 * capped to what the screen can actually carry, because the setting lives on the account rather
 * than the device: 10 chosen at a desk would otherwise follow you to a phone and render ten 30px
 * slivers. The cap only ever lowers the count for this screen; the stored choice is untouched and
 * comes back in full on a display that can hold it.
 */
export function useTileGrid(): TileGrid {
  const { user } = useAuth()
  const tilesPerRow = readTilesPerRow(user?.user_metadata as Record<string, unknown> | undefined)
  const maxTilesPerRow = useMaxTilesPerRow()

  if (tilesPerRow === 'auto') {
    return { className: TASK_TILE_GRID, style: undefined }
  }
  return {
    className: 'mt-2 grid gap-2.5 sm:gap-3',
    style: {
      gridTemplateColumns: `repeat(${Math.min(tilesPerRow, maxTilesPerRow)}, minmax(0, 1fr))`,
    },
  }
}
