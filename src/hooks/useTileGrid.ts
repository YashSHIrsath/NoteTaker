import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { maxTilesPerRowForWidth, readTilesPerRow } from '../lib/viewStyle'

/** Live viewport width. The readable-size cap moves with it — rotating a phone or resizing a
 *  window changes how many cards can sit across a row and still say anything. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

/** The most cards this screen can fit across a row before they stop being readable. */
export function useMaxTilesPerRow(): number {
  return maxTilesPerRowForWidth(useViewportWidth())
}

/**
 * How many cards fit across a row at their smallest — the account's setting, capped by what this
 * screen can actually carry.
 *
 * This is the number the grid's minimum card width comes from: set 2 and a card can never be
 * narrower than half the canvas, set 4 and never narrower than a quarter. On `auto` it's whatever
 * the screen allows, which is what the layout did before there was a setting at all.
 *
 * The cap is why a choice made at a desk doesn't follow you to a phone as four unreadable strips.
 */
export function useCardsPerRow(): number {
  const { user } = useAuth()
  const setting = readTilesPerRow(user?.user_metadata as Record<string, unknown> | undefined)
  const max = useMaxTilesPerRow()
  return setting === 'auto' ? max : Math.min(setting, max)
}
