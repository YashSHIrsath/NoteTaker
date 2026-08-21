import { cn } from '../../lib/cn'

export interface ImagePreviewProps {
  src: string
  alt: string
}

export function ImagePreview({ src, alt }: ImagePreviewProps) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
      <img
        src={src}
        alt={alt}
        className={cn('mx-auto block h-auto w-auto max-h-[28rem] max-w-full object-contain')}
      />
    </div>
  )
}
