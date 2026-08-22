export interface ImagePreviewProps {
  src: string
  alt: string
}

export function ImagePreview({ src, alt }: ImagePreviewProps) {
  return (
    <div className="flex items-center justify-center p-3">
      {/* Bounded by the viewport (minus the dialog's own header and padding) rather than a
          fixed pixel cap — a 28rem ceiling shrank tall photos well below the space available
          and left the panel padded out with emptiness underneath. */}
      <img
        src={src}
        alt={alt}
        className="block max-h-[calc(90vh-5rem)] w-auto max-w-full rounded-lg object-contain"
      />
    </div>
  )
}
