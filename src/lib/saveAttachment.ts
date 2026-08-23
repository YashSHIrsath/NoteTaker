/**
 * Hands a stored file to the platform to save.
 *
 * The obvious version — an <a href={signedUrl} download> — does not work here, and that is why
 * downloads did nothing. The `download` attribute is honoured only for same-origin URLs; the
 * files live on Supabase's domain, so browsers ignore it and navigate to the file instead. On a
 * phone that leaves the app, and in a WebView, which has no PDF renderer or download manager,
 * it does nothing at all.
 *
 * The file's bytes are already available (the previews read them), so the anchor is pointed at a
 * blob URL of our own origin. That both restores the real filename and keeps the download inside
 * the app. If the bytes can't be fetched, opening the signed URL is still better than nothing.
 */
export async function saveAttachment(
  file: File | null,
  fallbackUrl: string | null,
  name: string,
): Promise<'saved' | 'opened' | 'failed'> {
  if (file) {
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.rel = 'noreferrer'
    // Firefox needs the anchor in the document for a synthetic click to count.
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    // Long enough for the save to have started; revoking immediately cancels it in Safari.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    return 'saved'
  }

  if (fallbackUrl) {
    window.open(fallbackUrl, '_blank', 'noopener,noreferrer')
    return 'opened'
  }

  return 'failed'
}
