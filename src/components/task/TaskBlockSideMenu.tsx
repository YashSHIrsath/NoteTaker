import { ChevronDown, ChevronUp } from 'lucide-react'
import { SideMenuExtension } from '@blocknote/core'
import {
  AddBlockButton,
  BlockColorsItem,
  DragHandleButton,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
} from '@blocknote/react'

type Direction = 'up' | 'down'

/** The block the side menu is currently attached to — the same store BlockNote's own drag handle
 *  and menu items read, so these entries always act on the block you're pointing at. */
function useSideMenuBlockId(): string | undefined {
  return useExtensionState(SideMenuExtension, { selector: (state) => state?.block })?.id
}

/** Move up / Move down, as entries in the drag handle's own menu. */
function MoveBlockItem({ direction }: { direction: Direction }) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor()
  const blockId = useSideMenuBlockId()

  if (!blockId) {
    return null
  }
  return (
    <Components.Generic.Menu.Item
      onClick={() => {
        if (direction === 'up') {
          editor.moveBlocksUp(blockId)
        } else {
          editor.moveBlocksDown(blockId)
        }
      }}
      icon={direction === 'up' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    >
      {direction === 'up' ? 'Move up' : 'Move down'}
    </Components.Generic.Menu.Item>
  )
}

/** BlockNote's default drag handle menu (Delete, Colors) plus the two move entries. */
function TaskDragHandleMenu() {
  return (
    <DragHandleMenu>
      <MoveBlockItem direction="up" />
      <MoveBlockItem direction="down" />
      <RemoveBlockItem>Delete</RemoveBlockItem>
      <BlockColorsItem>Colors</BlockColorsItem>
    </DragHandleMenu>
  )
}

/**
 * BlockNote's side menu, unchanged in layout — the "+" and the drag handle, one row in the gutter
 * — with Move up / Move down added to the handle's menu.
 *
 * That placement is deliberately the same on every device. BlockNote moves blocks with HTML5
 * drag-and-drop, which browsers only synthesize for a mouse, so on touch the handle can't be
 * dragged; tapping it opens this menu, and the two move entries do the reordering instead (the
 * same `moveBlocksUp`/`moveBlocksDown` the keyboard shortcuts use). Putting standalone up/down
 * buttons in the gutter for touch was the other option and it looked terrible: three stacked
 * buttons don't fit a 54px gutter, so they ran down across the following lines of text.
 */
export function TaskBlockSideMenu() {
  return (
    <SideMenuController
      sideMenu={(props) => (
        <SideMenu {...props}>
          <AddBlockButton />
          <DragHandleButton {...props} dragHandleMenu={TaskDragHandleMenu} />
        </SideMenu>
      )}
    />
  )
}
