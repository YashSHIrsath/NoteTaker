import { useLayoutEffect, useMemo, useRef } from 'react'
import { BlockNoteEditor } from '@blocknote/core'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import './TaskBlockNoteEditor.css'
import { useFolders } from '../../hooks/useFolders'
import { useTheme } from '../../hooks/useTheme'
import { buildInitialBlocks } from '../../lib/blockNoteContent'

export interface TaskContentPreviewProps {
  taskId: string
  content: string
}

/**
 * One never-mounted editor, reused by every preview purely as a serializer.
 *
 * This MUST NOT become a mounted `BlockNoteView`. BlockNote's side menu resolves which editor a
 * drag or hover belongs to with `document.querySelectorAll(".bn-editor")` and picks whichever
 * one is geometrically closest to the pointer (see SideMenuView.findClosestEditorElement) — it
 * has no notion of stacking order, visibility, or `editable`. A grid of mounted previews behind
 * the open task dialog therefore competed with the real editor: hovering could resolve to a
 * preview (hiding the drag handle), and dropping could resolve to one, in which case the origin
 * editor ran `tr.deleteSelection()` while the read-only preview silently ignored the drop
 * (ProseMirror gates `drop` behind `view.editable`) — the dragged block was deleted and never
 * re-inserted. Serializing to static HTML keeps the previews pixel-faithful while leaving
 * exactly one real editor in the document.
 */
let sharedSerializer: BlockNoteEditor | undefined

type SerializableBlocks = Parameters<BlockNoteEditor['blocksToFullHTML']>[0]

function serializeToHtml(blocks: ReturnType<typeof buildInitialBlocks>): string {
  sharedSerializer ??= BlockNoteEditor.create()
  // Same pattern the Markdown/PDF export already uses: block ids, data-content-type attributes
  // and nested block groups all come out exactly as the editor renders them, so the preview CSS
  // and the attachment click handling (which resolve blocks by `data-id`) keep working.
  //
  // StoredBlock is our deliberately loose JSON round-tripping shape (see blockNoteContent.ts) —
  // the same value that used to be handed to `initialContent`, whose option type is untyped
  // enough to take it directly. This entry point is generic over the schema, so it needs saying.
  return sharedSerializer.blocksToFullHTML(blocks as unknown as SerializableBlocks)
}

/** Read-only rendering of a task's real BlockNote document — same block order, markup and
 * layout as the editor, produced by BlockNote's own serializer instead of a live editor
 * instance, so a folder-grid card shows exactly what the task contains. */
export function TaskContentPreview({ taskId, content }: TaskContentPreviewProps) {
  const { getAttachmentsForTask, getSubtasksForTask } = useFolders()
  const { theme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(
    () => serializeToHtml(buildInitialBlocks(content, getAttachmentsForTask(taskId), getSubtasksForTask(taskId))),
    [taskId, content, getAttachmentsForTask, getSubtasksForTask],
  )

  // A block can genuinely be center/right/justified in the real editor, but that reads as
  // broken squeezed into a small preview card. The CSS override in TaskBlockNoteEditor.css
  // should already win this on specificity, but forcing it directly onto the nodes here too
  // is a guaranteed backstop regardless of any cascade/load-order surprise.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const misaligned = container.querySelectorAll<HTMLElement>(
      '[data-text-alignment="center"], [data-text-alignment="right"], [data-text-alignment="justify"]',
    )
    misaligned.forEach((element) => {
      element.style.setProperty('text-align', 'left', 'important')
      element.style.setProperty('justify-content', 'flex-start', 'important')
    })
  })

  return (
    <div ref={containerRef} className="task-blocknote task-blocknote-preview">
      {/* bn-root carries BlockNote's own theme variables (the class its editor container uses);
          deliberately *not* bn-editor — see the note on sharedSerializer above. */}
      <div className="bn-root" data-color-scheme={theme === 'dark' ? 'dark' : 'light'}>
        <div
          className="bn-static-content bn-default-styles"
          // BlockNote's serializer builds this via DOM APIs (text is escaped by construction),
          // and it renders the same document the editor would.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
