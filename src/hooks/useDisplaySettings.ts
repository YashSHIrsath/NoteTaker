import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { useSpaces } from './useSpaces'
import { useWorkspace } from './useWorkspace'
import { readNavOrder, resolveNavOrder, type NavId } from '../lib/navOrder'
import { readViewStyle, type ViewStyle } from '../lib/viewStyle'

/**
 * The display settings in force, and where they came from.
 *
 * Two of them belong to the workspace rather than to a person. Inside a shared space the tab order
 * and the note style describe the space: everyone is looking at the same tree, so one member
 * arranging it arranges it for the others. Until somebody sets them, each member's own preference
 * applies — which is what makes opening a brand-new space feel like the app you already use.
 *
 * Tiles per row is deliberately not here. It is a function of the screen in front of you and is
 * already stored per screen size, so it stays personal in a space exactly as it is outside one.
 */
export interface DisplaySettings {
  navOrder: NavId[]
  viewStyle: ViewStyle
  /** True when the value came from the space rather than from your account — the settings screen
   *  says so, because "everyone sees this" is the part worth knowing before changing it. */
  navOrderIsShared: boolean
  viewStyleIsShared: boolean
}

export function useDisplaySettings(): DisplaySettings {
  const { user } = useAuth()
  const workspace = useWorkspace()
  const { getSpace } = useSpaces()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const space = workspace.kind === 'space' ? getSpace(workspace.id) : undefined

  const sharedNavOrder = space?.navOrder ?? null
  const sharedViewStyle = space?.viewStyle ?? null

  return {
    // Run the space's stored order through the same repair the account's goes through, so a space
    // whose order was written by a build with different tabs still produces a bar this one can draw.
    navOrder: sharedNavOrder
      ? readNavOrder({ nav_order: sharedNavOrder.join(',') })
      : resolveNavOrder(metadata),
    viewStyle: sharedViewStyle ?? readViewStyle(metadata),
    navOrderIsShared: sharedNavOrder !== null,
    viewStyleIsShared: sharedViewStyle !== null,
  }
}

export interface DisplaySettingsWriter {
  /** True while a space is open, so the settings screen can say who a change is for. */
  writesToSpace: boolean
  spaceName: string | null
  save: (update: { navOrder?: NavId[]; viewStyle?: ViewStyle }) => Promise<void>
}

/**
 * Where a change to those settings goes.
 *
 * Inside a space, to the space — for everyone. Outside one, to the account. One writer rather than
 * two call sites deciding for themselves, because a settings screen that saved to the wrong place
 * would look like it had saved nothing at all.
 */
export function useDisplaySettingsWriter(): DisplaySettingsWriter {
  const { updateProfile } = useAuth()
  const workspace = useWorkspace()
  const { getSpace, setDisplaySettings } = useSpaces()
  const space = workspace.kind === 'space' ? getSpace(workspace.id) : undefined
  const spaceId = workspace.kind === 'space' ? workspace.id : null

  const save = useCallback(
    async (update: { navOrder?: NavId[]; viewStyle?: ViewStyle }) => {
      if (spaceId) {
        await setDisplaySettings(spaceId, update)
        return
      }
      await updateProfile(update)
    },
    [setDisplaySettings, spaceId, updateProfile],
  )

  return { writesToSpace: spaceId !== null, spaceName: space?.name ?? null, save }
}
