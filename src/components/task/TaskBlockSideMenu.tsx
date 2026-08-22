import { useEffect, useRef } from 'react'
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
  useEditorSelectionChange,
  useExtensionState,
} from '@blocknote/react'

type Direction = 'up' | 'down'

/** Long enough that a burst of typing doesn't re-show the menu on every keystroke (BlockNote hides
 *  it on keydown by design), short enough to feel immediate once you stop. */
const FOLLOW_CARET_DELAY_MS = 150

/**
 * Keeps the side menu attached to the block you're actually in, without hovering it.
 *
 * BlockNote positions this menu from mousemove alone — that's why the "+" and the drag handle only
 * appear under the pointer, which is no use on a touch screen and unhelpful while typing. There's
 * no public API to say "attach to this block", so this feeds it the input it already understands:
 * a mousemove at the caret's own block. Everything downstream (positioning, the drag handle's
 * menu, hiding when the pointer leaves) stays BlockNote's own behaviour.
 */
function useMenuFollowsCaret() {
  const editor = useBlockNoteEditor()
  const timerRef = useRef<number | null>(null)

  const point = () => {
    const view = editor.prosemirrorView
    if (!view) {
      return
    }
    const blockId = editor.getTextCursorPosition()?.block?.id
    if (!blockId) {
      return
    }
    const element = view.dom.querySelector<HTMLElement>(`[data-id="${blockId}"]`)
    if (!element) {
      return
    }
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      return
    }
    element.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        clientX: rect.left + 12,
        // Near the top of the block, so a block with nested children still resolves to itself
        // rather than to one of them.
        clientY: rect.top + Math.min(14, rect.height / 2),
      }),
    )
  }

  const schedule = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(point, FOLLOW_CARET_DELAY_MS)
  }

  useEditorSelectionChange(schedule, editor)

  useEffect(() => {
    // Also on mount, so the controls are there before the first click rather than after it.
    schedule()
    const view = editor.prosemirrorView
    view?.dom.addEventListener('focus', schedule)
    return () => {
      view?.dom.removeEventListener('focus', schedule)
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])
}

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
  useMenuFollowsCaret()

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
