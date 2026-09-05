import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { useCreateBlockNote, useEditorChange } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import './TaskBlockNoteEditor.css'
import type { Attachment } from '../../types'
import { cn } from '../../lib/cn'
import { useFolders } from '../../hooks/useFolders'
import { useTheme } from '../../hooks/useTheme'
import { attachmentIdFromUrl, attachmentUrlFor, buildInitialBlocks } from '../../lib/blockNoteContent'
import { isAcceptedImageFile, isAcceptedPdfFile } from '../../services/attachments'
import { AttachmentPreviewDialog } from '../attachment/AttachmentPreviewDialog'
import { TaskBlockSideMenu } from './TaskBlockSideMenu'

/**
 * The editor's blocks, minus audio and video.
 *
 * Neither can be stored: uploads are limited to images, PDFs and documents, so picking "Video"
 * from the slash menu could only ever end in a rejected upload or an embed pointing at somebody
 * else's server. Removing them from the schema removes them everywhere at once — the slash menu,
 * the "+" menu and paste handling all read from it — rather than hiding two menu entries and
 * leaving the blocks reachable by other routes.
 */
const { audio: _audio, video: _video, ...supportedBlockSpecs } = defaultBlockSpecs
const schema = BlockNoteSchema.create({ blockSpecs: supportedBlockSpecs })

export interface TaskBlockNoteEditorProps {
  taskId: string
  content: string
  onContentChange: (content: string) => void
  /** Gutter controls ("+" and drag handle). Off, the editor gives that 54px back to the text. */
  showBlockHandles?: boolean
  /** Inline pictures shown as a name chip instead of the picture itself. */
  collapseImages?: boolean
  /**
   * Reading mode: the note can be scrolled and its checklist ticked off, and nothing else about
   * it can be changed. See the checkbox note in the effect below for why ticking still works.
   */
  readOnly?: boolean
}

const CONTENT_FLUSH_DELAY_MS = 300
/** Matches the side menu's slide-out in TaskBlockNoteEditor.css. */
const HANDLES_EXIT_MS = 180

export function TaskBlockNoteEditor({
  taskId,
  content,
  onContentChange,
  showBlockHandles = false,
  collapseImages = false,
  readOnly = false,
}: TaskBlockNoteEditorProps) {
  const {
    getAttachmentsForTask,
    getAttachmentPreviewUrl,
    getSubtasksForTask,
    addImageAttachment,
    addPdfAttachment,
    addDocumentAttachment,
  } = useFolders()
  const { isDark } = useTheme()
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  // Unmounting the side menu the instant the toggle flips would cut its slide-out short, so it
  // outlives the switch by exactly one animation.
  const [handlesMounted, setHandlesMounted] = useState(showBlockHandles)
  const editorWrapperRef = useRef<HTMLDivElement>(null)

  // Seeds the editor once per task; BlockNote owns the live document after that, so later
  // prop changes here are intentionally ignored.
  const initialContent = useMemo(
    () => buildInitialBlocks(content, getAttachmentsForTask(taskId), getSubtasksForTask(taskId)),
    [taskId],
  )

  const editor = useCreateBlockNote(
    {
      schema,
      initialContent,
      uploadFile: async (file: File) => {
        try {
          let attachment: Attachment | null = null
          if (isAcceptedImageFile(file)) {
            attachment = await addImageAttachment(taskId, file)
          } else if (isAcceptedPdfFile(file)) {
            attachment = await addPdfAttachment(taskId, file)
          } else {
            // Anything else — a recognized office/text format (doc/docx/xls/xlsx/csv/md/txt) or
            // not — still attaches; see classifyAttachmentFile for the 'file' catch-all.
            attachment = await addDocumentAttachment(taskId, file)
          }
          if (!attachment) {
            throw new Error(`Upload of "${file.name}" did not return an attachment.`)
          }
          // BlockNote only auto-wraps a returned *string* into { props: { url, name } } before
          // calling updateBlock; a returned object is passed to updateBlock as-is, so it must
          // already be shaped as a block-props patch or the url/name never actually apply.
          const url = attachmentUrlFor(attachment.id)

          // Pictures are shown inline; anything else stays a compact pill (see the file-block
          // rules in TaskBlockNoteEditor.css) that can be renamed from the formatting toolbar and
          // opened from the note's bottom bar.
          return { props: { url, name: file.name, showPreview: attachment.isImage } }
        } catch (error) {
          // The addImageAttachment/addPdfAttachment/addDocumentAttachment call now rethrows
          // the real repository error (bucket missing, RLS denial, size limit, etc.) instead
          // of swallowing it to null, so this is the actual cause, not a generic message.
          console.error('BlockNote file upload failed:', error)
          throw error
        }
      },
      resolveFileUrl: async (url: string) => {
        // BlockNote's own image/file renderer calls `.then()` on this with no `.catch()`, so
        // this must never reject and never hang, or the block is stuck "Loading..." forever.
        const attachmentId = attachmentIdFromUrl(url)
        if (!attachmentId) {
          return url
        }
        try {
          const resolved = await getAttachmentPreviewUrl(attachmentId)
          return resolved || url
        } catch (error) {
          console.error('BlockNote could not resolve a file URL:', error)
          return url
        }
      },
    },
    [taskId],
  )

  // Pushing every keystroke straight into context re-renders every useFolders() consumer in
  // the app (sidebar, every card and tile) on each character — the cause of visibly laggy
  // typing on a phone, and of Enter feeling like it dropped. The editor owns the live document
  // while it's mounted, so context only needs the text often enough for previews and the
  // (already debounced) save; batching to one update per idle pause costs nothing.
  const latestContentRef = useRef<string | null>(null)
  const contentFlushTimerRef = useRef<number | null>(null)
  const onContentChangeRef = useRef(onContentChange)
  // Android soft keyboards type through an IME *composition* (the word-suggestion strip). A
  // React re-render landing mid-composition corrupts ProseMirror's composition state, and the
  // symptom is the Enter key doing nothing at all. Nothing may reach context until the IME has
  // committed the word, so the flush waits for compositionend.
  const isComposingRef = useRef(false)

  useEffect(() => {
    onContentChangeRef.current = onContentChange
  }, [onContentChange])

  useEffect(() => {
    if (showBlockHandles) {
      setHandlesMounted(true)
      return
    }
    const timer = window.setTimeout(() => setHandlesMounted(false), HANDLES_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [showBlockHandles])

  const flushContent = useCallback(() => {
    if (contentFlushTimerRef.current !== null) {
      window.clearTimeout(contentFlushTimerRef.current)
      contentFlushTimerRef.current = null
    }
    const pending = latestContentRef.current
    latestContentRef.current = null
    if (pending !== null) {
      onContentChangeRef.current(pending)
    }
  }, [])

  // Not reset per keystroke: the timer starts on the first change of a burst and isn't
  // extended, so continuous typing still hands content over every ~300ms (previews never go
  // stale for long) while collapsing a whole burst of characters into one context update.
  useEditorChange((current) => {
    latestContentRef.current = JSON.stringify(current.document)
    if (contentFlushTimerRef.current !== null) {
      return
    }
    contentFlushTimerRef.current = window.setTimeout(() => {
      contentFlushTimerRef.current = null
      if (isComposingRef.current) {
        // compositionend flushes instead — re-rendering now would break the live composition.
        return
      }
      flushContent()
    }, CONTENT_FLUSH_DELAY_MS)
  }, editor)

  useEffect(() => {
    const wrapper = editorWrapperRef.current
    if (!wrapper) {
      return
    }
    const onCompositionStart = () => {
      isComposingRef.current = true
    }
    const onCompositionEnd = () => {
      isComposingRef.current = false
      flushContent()
    }
    wrapper.addEventListener('compositionstart', onCompositionStart)
    wrapper.addEventListener('compositionend', onCompositionEnd)

    // Without an explicit hint, an Android keyboard picks Enter's meaning itself and often
    // makes it an action key (which does nothing here) rather than a newline. Read off the
    // view rather than querying the DOM — a querySelector here can run before ProseMirror has
    // mounted its editable and silently find nothing.
    editor.prosemirrorView?.dom.setAttribute('enterkeyhint', 'enter')

    // Enter does nothing on Android Chrome, and it's ProseMirror doing it deliberately: its
    // keydown handler opens with `if (android && chrome && event.keyCode == 13) return`, so the
    // key never reaches the keymap. (Gboard compounds it — Chrome reports Enter as keyCode 229,
    // "the IME is handling this", while prediction is active.) Dispatching a synthetic keydown
    // is useless for the same reason: it hits that same guard.
    //
    // So take the route ProseMirror itself uses for Android backspace — blur/focus to reset the
    // IME, then invoke the keymap prop directly via someProp, which sidesteps the guard while
    // still running BlockNote's real Enter command (splitting blocks, continuing lists).
    //
    // Only ever runs on Android: everywhere else ProseMirror handles Enter on keydown and
    // cancels the event, which means beforeinput is never dispatched at all.
    const onBeforeInput = (event: Event) => {
      if ((event as InputEvent).inputType !== 'insertParagraph') {
        return
      }
      const view = editor.prosemirrorView
      if (!view) {
        return
      }
      event.preventDefault()
      const enterKey = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      })
      // keyCode isn't settable through the constructor and ProseMirror still reads it.
      Object.defineProperty(enterKey, 'keyCode', { get: () => 13 })
      Object.defineProperty(enterKey, 'which', { get: () => 13 })
      view.dom.blur()
      view.focus()
      view.someProp('handleKeyDown', (handler) => handler(view, enterKey))
    }
    wrapper.addEventListener('beforeinput', onBeforeInput)

    return () => {
      wrapper.removeEventListener('compositionstart', onCompositionStart)
      wrapper.removeEventListener('compositionend', onCompositionEnd)
      wrapper.removeEventListener('beforeinput', onBeforeInput)
    }
  }, [editor, flushContent])

  /**
   * Ticking a box is still allowed while reading.
   *
   * BlockNote ties the checkbox to the editor's editability twice over: its node view sets
   * `input.disabled = !editor.isEditable` when it renders, and its own change handler opens with
   * an `isEditable` guard. So a read-only note gets a greyed-out checklist you cannot use, which
   * is the one thing this mode is supposed to keep.
   *
   * Both are undone here. The disabled attribute is cleared as blocks render — a MutationObserver
   * rather than a single pass, because every toggle re-renders that node view and it comes back
   * disabled — and the change is applied through the editor API, which goes straight to a
   * transaction and carries no editability guard of its own. Nothing else about the note is
   * reachable: ProseMirror is not contenteditable, so there is no caret, no typing and no menus.
   */
  useEffect(() => {
    const wrapper = editorWrapperRef.current
    if (!readOnly || !wrapper) {
      return
    }
    const enable = () => {
      for (const box of wrapper.querySelectorAll<HTMLInputElement>('input[type="checkbox"][disabled]')) {
        box.disabled = false
      }
    }
    enable()
    const observer = new MutationObserver(enable)
    observer.observe(wrapper, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] })

    const onChange = (event: Event) => {
      const box = event.target as HTMLElement | null
      if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox') {
        return
      }
      const blockId = box.closest<HTMLElement>('[data-id]')?.getAttribute('data-id')
      if (!blockId) {
        return
      }
      const block = editor.getBlock(blockId)
      if (!block || block.type !== 'checkListItem') {
        return
      }
      editor.updateBlock(block, { props: { checked: box.checked } })
    }
    wrapper.addEventListener('change', onChange)

    return () => {
      observer.disconnect()
      wrapper.removeEventListener('change', onChange)
    }
  }, [editor, readOnly])

  // Closing the dialog unmounts this before an in-flight timer fires, so the last edits have
  // to be handed over synchronously here or they're lost.
  useEffect(() => () => flushContent(), [flushContent])

  const openAttachment = (attachmentId: string) => {
    const attachment = getAttachmentsForTask(taskId).find((item) => item.id === attachmentId)
    if (attachment) {
      setPreviewAttachment(attachment)
    }
  }

  // Attachment blocks render as compact boxes (showPreview: false) with no click behavior of
  // their own, so a click anywhere on one is caught here and resolved back to the attachment
  // via the block's stored url, instead of wiring a handler into every block individually.
  const handleContentClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const blockContent = target.closest<HTMLElement>('[data-content-type="image"], [data-content-type="file"]')
    if (!blockContent) {
      return
    }
    const blockOuter = blockContent.closest<HTMLElement>('[data-id]')
    const blockId = blockOuter?.getAttribute('data-id')
    if (!blockId) {
      return
    }
    const block = editor.getBlock(blockId)
    const props = block?.props as { url?: unknown } | undefined
    const url = typeof props?.url === 'string' ? props.url : ''
    const attachmentId = attachmentIdFromUrl(url)
    if (!attachmentId) {
      return
    }
    event.preventDefault()
    openAttachment(attachmentId)
  }

  return (
    <div
      className={cn(
        'task-blocknote',
        readOnly ? 'task-blocknote-reading' : null,
        showBlockHandles && !readOnly ? null : 'task-blocknote-flush',
        collapseImages ? 'task-blocknote-images-collapsed' : null,
      )}
    >
      <div ref={editorWrapperRef} className="relative" onClick={handleContentClick}>
        {/* sideMenu={false} disables BlockNote's *default* side menu; TaskBlockSideMenu renders the
            same one with the block-move control matched to the input device — and only when the
            gutter controls are switched on. Everything else (the "/" menu included) is untouched.

            emojiPicker={false} turns off BlockNote's colon-triggered emoji grid. Its trigger is a
            literal ":" — so typing a time like "10:45" opened it (searching emoji-mart for "45"
            surfaces a couple of clock-face emoji, which is what looked like a "time suggestion").
            Worse, its Enter handler captures the keydown on the editor DOM before ProseMirror's own
            keymap sees it, unconditionally preventing default — with zero matches Enter did nothing
            at all, which is the "stuck, can't get to the next line" symptom. Nothing in this app
            relies on typing ":" to insert an emoji, so it's switched off rather than special-cased. */}
        <BlockNoteView
          editor={editor}
          editable={!readOnly}
          theme={isDark ? 'dark' : 'light'}
          sideMenu={false}
          emojiPicker={false}
        >
          {handlesMounted && !readOnly ? <TaskBlockSideMenu /> : null}
        </BlockNoteView>
      </div>

      <AttachmentPreviewDialog attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </div>
  )
}
