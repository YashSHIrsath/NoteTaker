import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import type { Attachment } from '../../types'
import { cn } from '../../lib/cn'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useResizablePanel } from '../../hooks/useResizablePanel'
import { IconButton } from '../ui/IconButton'
import { Spinner } from '../ui/Spinner'
import { useFolders } from '../../hooks/useFolders'
import { saveAttachment } from '../../lib/saveAttachment'
import { ImagePreview } from './ImagePreview'
import { PdfPreview } from './PdfPreview'
import { DocumentPreview } from './DocumentPreview'
import { CsvPreview } from './CsvPreview'
import { ExcelPreview } from './ExcelPreview'
import { TextPreview } from './TextPreview'
import { MarkdownPreview } from './MarkdownPreview'
import { UnsupportedPreview } from './UnsupportedPreview'

export interface AttachmentPreviewDialogProps {
  attachment: Attachment | null
  onClose: () => void
}

const SIZE_KEY = 'mynotes-attachment-dialog-size'

/** Same floor as TaskEditorDialog's panel — small enough to still show a PDF page or a
 *  spreadsheet's columns, not so small the header (name + download + close) has nowhere to go. */
const MIN_WIDTH = 420
const MIN_HEIGHT = 320
const VIEWPORT_MARGIN = 32

function AttachmentPreviewBody({ attachment }: { attachment: Attachment }) {
  if (attachment.isImage) {
    return <ImagePreview src={attachment.previewUrl} alt={attachment.name} />
  }
  if (attachment.isPdf) {
    return <PdfPreview attachment={attachment} />
  }
  if (attachment.type === 'csv') {
    return <CsvPreview attachment={attachment} />
  }
  if (attachment.type === 'xls' || attachment.type === 'xlsx') {
    return <ExcelPreview attachment={attachment} />
  }
  if (attachment.type === 'md') {
    return <MarkdownPreview attachment={attachment} />
  }
  if (attachment.type === 'txt') {
    return <TextPreview attachment={attachment} />
  }
  if (attachment.type === 'file') {
    return <UnsupportedPreview attachment={attachment} />
  }
  return <DocumentPreview attachment={attachment} />
}

export function AttachmentPreviewDialog({ attachment, onClose }: AttachmentPreviewDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { getAttachmentFile } = useFolders()
  const [saving, setSaving] = useState(false)
  const open = attachment !== null

  useDialogFocus(open, panelRef)

  // Same drag-to-resize the task popup has (see TaskEditorDialog) — a PDF, image or spreadsheet
  // preview used to be stuck at a fixed size with no way to see more of it at once.
  const { panelStyle, resizeHandles } = useResizablePanel({
    panelRef,
    storageKey: SIZE_KEY,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    viewportMargin: VIEWPORT_MARGIN,
  })

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!attachment) {
    return null
  }

  const save = async () => {
    setSaving(true)
    try {
      const file = await Promise.resolve(getAttachmentFile(attachment.id))
      await saveAttachment(file, attachment.previewUrl, attachment.name)
    } finally {
      setSaving(false)
    }
  }

  // Portalled to the body, and it has to be. This dialog is rendered from inside a task card,
  // and cards sit in grid items that react-grid-layout positions with `transform` — a transform
  // makes that element the containing block for any `position: fixed` descendant, so `inset-0`
  // resolved to the card's own box instead of the viewport. That's why a photo opened at
  // thumbnail size inside the note rather than over the screen. The other dialogs in the app
  // (MoveTaskDialog and friends) portal for the same reason.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={attachment.name}
        tabIndex={-1}
        /*
         * A dragged size, when there is one, beats every class below — see TaskEditorDialog and
         * useResizablePanel for why this has to be inline rather than a class.
         */
        style={panelStyle}
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none',
          'pt-[env(safe-area-inset-top)] sm:max-w-3xl sm:rounded-xl sm:pt-0',
          // A PDF/spreadsheet viewer needs a tall scroll area to fill, but an image only needs
          // its own height — forcing 85vh on a portrait photo is what left a large empty gap
          // under it, so images size the panel to the picture instead.
          //
          // Both branches set the height, and `sm:h-auto` lives here rather than on the line
          // above for that reason: on the shared line it sat alongside the explicit height and
          // both are `height` utilities at the same specificity, so which one won came down to
          // the order Tailwind happened to emit them in — and it emits `h-auto` last. Every
          // non-image preview was therefore `height: auto` from `sm` up, growing to fit its
          // content: a PDF pushed the panel's own header and toolbar off the top of the screen,
          // and the viewer, measuring a scroll area with no bounded height, could never fit a
          // page to it. Phones never saw it because no `sm:` utility applied there.
          //
          // Both are still overridden by `panelStyle`'s inline height once the panel has been
          // dragged to a size of its own — same rule as `sm:max-w-3xl` above.
          attachment.isImage ? 'sm:h-auto sm:max-h-[90vh]' : 'sm:h-[min(85vh,800px)]',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-[var(--color-text)]">{attachment.name}</span>
          {/* relative z-30: above the resize handles (z-20 — see useResizablePanel), whose `ne`
              corner grip would otherwise sit on top of Close and win hit-testing there. */}
          <div className="relative z-30 flex shrink-0 items-center gap-0.5">
            <IconButton
              label={saving ? `Saving ${attachment.name}` : `Download ${attachment.name}`}
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? <Spinner /> : <Download className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        {/* The PDF viewer scrolls itself — it has a toolbar that has to stay put while the pages
            move under it, and it needs to know how tall the visible area is to fit a page into
            it. Everything else is a block of content the dialog scrolls for it. */}
        <div className={cn('relative min-h-0 flex-1', attachment.isPdf ? 'overflow-hidden' : 'overflow-auto')}>
          <AttachmentPreviewBody attachment={attachment} />
        </div>

        {/* The grips, last so they paint over the preview's own edges — see TaskEditorDialog for
            the fuller reasoning (same aria-hidden, same reason it isn't a tab stop). */}
        {resizeHandles}
      </div>
    </div>,
    document.body,
  )
}
