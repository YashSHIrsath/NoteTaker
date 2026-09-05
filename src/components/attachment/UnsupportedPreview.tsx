import type { Attachment } from '../../types'
import { PreviewStatus } from './SpreadsheetTable'

export interface UnsupportedPreviewProps {
  attachment: Attachment
}

/** The generic 'file' type — anything that isn't an image, PDF, or one of the specifically
 *  previewed office/text formats. It still uploaded and attached; there's just nothing this
 *  dialog knows how to render for it, so it says so instead of showing a blank pane. */
export function UnsupportedPreview({ attachment }: UnsupportedPreviewProps) {
  return <PreviewStatus>{`"${attachment.name}" can't be previewed here. Use Download above to open it.`}</PreviewStatus>
}
