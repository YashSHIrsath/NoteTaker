import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BlockNoteEditor } from '@blocknote/core'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import './TaskBlockNoteEditor.css'
import { useFolders } from '../../hooks/useFolders'
import { useTheme } from '../../hooks/useTheme'
import { buildInitialBlocks, isBlockNoteContent, setBlockChecked } from '../../lib/blockNoteContent'

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
  const { getAttachmentsForTask, getSubtasksForTask, updateTaskContent } = useFolders()
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

  // ------------------------------------------------------------------ interactivity
  //
  // The preview is a string of HTML, so nothing BlockNote's own renderer wired up survives the
  // trip: the checkbox arrives `disabled` (the serializer's editor isn't editable) and every
  // listener is gone. Two of those controls are worth having back on the card front — ticking a
  // line off and folding a section away are things you want to do while looking at the note, not
  // reasons to open it. Everything else stays inert, so a click anywhere else still opens the task.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    // BlockNote's serializer runs makeCheckListItemsReadOnly over its output, so every box in the
    // HTML we just injected arrives disabled. Undoing that is only about appearance and keyboard
    // access — a disabled box renders greyed and can't be focused — since clicks are driven from
    // the wrapper, not the input. Legacy plain-text notes keep the greyed-out box, which is honest:
    // their blocks are synthesized on read with no stable ids, so a tick has nowhere to be saved.
    const writable = isBlockNoteContent(content)
    const boxes = container.querySelectorAll<HTMLInputElement>(
      '[data-content-type="checkListItem"] input[type="checkbox"]',
    )
    boxes.forEach((box) => {
      box.disabled = !writable
    })

    // Keyboard only: Space on a focused box. A click can't reach this — the handler below sets
    // `checked` from script, which fires no change event.
    const onChange = (event: Event) => {
      const box = (event.target as HTMLElement | null)?.closest<HTMLInputElement>(
        'input[type="checkbox"]',
      )
      if (!box) {
        return
      }
      const blockId = box.closest<HTMLElement>('[data-id]')?.getAttribute('data-id')
      const next = blockId ? setBlockChecked(content, blockId, box.checked) : null
      if (!next) {
        // Put it back: a box that stays ticked without the note changing is a lie.
        box.checked = !box.checked
        return
      }
      updateTaskContent(taskId, next, { immediate: true })
    }

    /**
     * The one thing every click in here has to do first is not reach the card.
     *
     * The card opens the note from a React `onClick`, which React dispatches from a single
     * listener on the app's root element — so the card's handler runs *after* this subtree, at the
     * very end of the bubble. A bubble listener here should therefore be enough to stop it, and
     * wasn't. Rather than keep guessing which step of the delegation wins, this listens in the
     * capture phase: capture reaches this container on the way *down*, before the target's own
     * handlers and long before anything on the way back up, so stopping here stops everything.
     *
     * Which click is ours needs no structural test. Everything in the preview inherits
     * `pointer-events: none` except the tick box's column and a toggle's arrow, so an event that
     * gets here at all started on one of the two.
     */
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) {
        return
      }

      const toggle = target.closest<HTMLElement>('.bn-toggle-button')
      if (toggle) {
        event.preventDefault()
        event.stopPropagation()
        const wrapper = toggle.closest<HTMLElement>('.bn-toggle-wrapper')
        if (!wrapper) {
          return
        }
        const open = wrapper.getAttribute('data-show-children') !== 'false'
        wrapper.setAttribute('data-show-children', open ? 'false' : 'true')
        // BlockNote keeps a toggle's open state in localStorage under this exact key rather than
        // in the document, so writing it here is what makes the card and the editor agree.
        const blockId = wrapper.closest<HTMLElement>('[data-id]')?.getAttribute('data-id')
        if (blockId) {
          window.localStorage.setItem(`toggle-${blockId}`, open ? 'false' : 'true')
        }
        return
      }

      const item = target.closest<HTMLElement>('[data-content-type="checkListItem"]')
      if (!item) {
        return
      }

      // Unconditional, and before anything that can fail: a click aimed at a tick box must never
      // fall through and open the note, whatever happens to the tick itself. An earlier version
      // bailed out here when the box was disabled — and BlockNote's serializer disables every one
      // of them on the way out (makeCheckListItemsReadOnly), so a single missed re-enable turned
      // every checkbox back into "opens the editor".
      event.preventDefault()
      event.stopPropagation()

      const box = item.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (!box) {
        return
      }

      const checked = !box.checked
      const blockId = item.closest<HTMLElement>('[data-id]')?.getAttribute('data-id')
      const next = blockId ? setBlockChecked(content, blockId, checked) : null
      if (!next) {
        return
      }

      // Painted immediately rather than waiting for the save to round-trip and re-serialize —
      // including data-checked, which is what BlockNote's own rule strikes the text through on.
      box.checked = checked
      item.setAttribute('data-checked', checked ? 'true' : 'false')
      updateTaskContent(taskId, next, { immediate: true })
    }

    /**
     * The same interception for the press that precedes the click. The card starts a touch drag
     * from `onPointerDown` and takes pointer capture for it, which would retarget the click that
     * follows onto the card — so on a phone the tap would open the note however well the click
     * above is handled. Its own guard only exempts `button, a, input, textarea`, and the box's
     * column is a plain div.
     */
    const onPress = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target) {
        return
      }
      if (
        target.closest('.bn-toggle-button') ||
        target.closest('[data-content-type="checkListItem"]')
      ) {
        event.stopPropagation()
      }
    }

    container.addEventListener('change', onChange)
    // Capture, not bubble — see onClick.
    container.addEventListener('click', onClick, true)
    container.addEventListener('pointerdown', onPress, true)
    container.addEventListener('mousedown', onPress, true)
    return () => {
      container.removeEventListener('change', onChange)
      container.removeEventListener('click', onClick, true)
      container.removeEventListener('pointerdown', onPress, true)
      container.removeEventListener('mousedown', onPress, true)
    }
  }, [content, html, taskId, updateTaskContent])

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
