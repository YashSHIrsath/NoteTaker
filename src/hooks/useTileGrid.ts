import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import {
  maxTilesPerRowForWidth,
  readTilesPerRow,
  tileBandForWidth,
  type TileBand,
} from '../lib/viewStyle'

/** Live viewport width. The band moves with it — rotating a phone or resizing a window changes
 *  both how many cards a row can carry and which screen size's setting applies. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

/** The screen size band this viewport is in — what the picker reads and writes. */
export function useTileBand(): TileBand {
  return tileBandForWidth(useViewportWidth())
}

/** The most cards this screen can fit across a row before they stop being readable. */
export function useMaxTilesPerRow(): number {
  return maxTilesPerRowForWidth(useViewportWidth())
}

/**
 * How many cards fit across a row at their smallest — this screen size's setting, capped by what
 * the screen can actually carry.
 *
 * This is the number the grid's minimum card width comes from: set 2 and a card can never be
 * narrower than half the canvas, set 3 and never narrower than a third. On `auto` it's whatever
 * the screen allows, which is what the layout did before there was a setting at all.
 *
 * The cap still applies on top of the band's own setting, because a band's stored value can come
 * from the legacy account-wide key — a 6 chosen before this was per-screen, read on a phone.
 */
export function useCardsPerRow(): number {
  const { user } = useAuth()
  const width = useViewportWidth()
  const band = tileBandForWidth(width)
  const setting = readTilesPerRow(user?.user_metadata as Record<string, unknown> | undefined, band.id)
  return setting === 'auto' ? band.max : Math.min(setting, band.max)
}
