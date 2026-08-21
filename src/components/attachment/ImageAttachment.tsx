import { Image as ImageIcon } from 'lucide-react'
import type { Attachment } from '../../types'
import { Button } from '../ui/Button'
import { ImagePreview } from './ImagePreview'

export interface ImageAttachmentProps {
  attachment: Attachment
  expanded: boolean
  onToggleExpanded: () => void
  onRemove?: () => void
  removing?: boolean
}

export function ImageAttachment({
  attachment,
  expanded,
  onToggleExpanded,
  onRemove,
  removing = false,
}: ImageAttachmentProps) {
  return (
    <div className="rounded-md px-1 py-1">
      <div className="flex min-w-0 items-center gap-2">
        <ImageIcon className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
          {attachment.name}
        </span>
        <Button variant="subtle" size="sm" onClick={onToggleExpanded}>
          {expanded ? 'Collapse Image' : 'Show Image'}
        </Button>
        {onRemove ? (
          <Button variant="subtle" size="sm" onClick={onRemove} disabled={removing}>
            {removing ? 'Removing…' : 'Remove'}
          </Button>
        ) : null}
      </div>
      {expanded ? (
        <ImagePreview src={attachment.previewUrl} alt={attachment.name} />
      ) : null}
    </div>
  )
}
