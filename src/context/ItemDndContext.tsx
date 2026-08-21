import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ItemDndKind = 'folder' | 'task'
export type DropPosition = 'before' | 'after'

export interface ItemDragSession {
  kind: ItemDndKind
  itemId: string
  groupId: string | null
}

export interface ItemDropHint {
  kind: ItemDndKind
  itemId: string
  position: DropPosition
}

interface ItemDndContextValue {
  dragging: ItemDragSession | null
  dropHint: ItemDropHint | null
  getDragging: () => ItemDragSession | null
  beginDrag: (session: ItemDragSession) => void
  updateDropHint: (hint: ItemDropHint | null) => void
  endDrag: () => void
}

const ItemDndContext = createContext<ItemDndContextValue | null>(null)

export function ItemDndProvider({ children }: { children: ReactNode }) {
  const draggingRef = useRef<ItemDragSession | null>(null)
  const [dragging, setDragging] = useState<ItemDragSession | null>(null)
  const [dropHint, setDropHint] = useState<ItemDropHint | null>(null)

  const getDragging = useCallback(() => draggingRef.current, [])

  const beginDrag = useCallback((session: ItemDragSession) => {
    draggingRef.current = session
    setDragging(session)
  }, [])

  const updateDropHint = useCallback((hint: ItemDropHint | null) => {
    setDropHint(hint)
  }, [])

  const endDrag = useCallback(() => {
    draggingRef.current = null
    setDragging(null)
    setDropHint(null)
  }, [])

  const value = useMemo(
    () => ({
      dragging,
      dropHint,
      getDragging,
      beginDrag,
      updateDropHint,
      endDrag,
    }),
    [dragging, dropHint, getDragging, beginDrag, updateDropHint, endDrag],
  )

  return <ItemDndContext.Provider value={value}>{children}</ItemDndContext.Provider>
}

export function useItemDnd(): ItemDndContextValue {
  const context = useContext(ItemDndContext)
  if (!context) {
    throw new Error('useItemDnd must be used within an ItemDndProvider')
  }
  return context
}
