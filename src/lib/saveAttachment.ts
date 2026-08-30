import { isNativeRuntime } from './platform'

/**
 * Hands a stored file to the platform to save.
 *
 * The obvious version — an <a href={signedUrl} download> — does not work here, and that is why
 * downloads did nothing. The `download` attribute is honoured only for same-origin URLs; the
 * files live on Supabase's domain, so browsers ignore it and navigate to the file instead.
 *
 * The file's bytes are already available (the previews read them), so on the web the anchor is
 * pointed at a blob URL of our own origin. That both restores the real filename and keeps the
 * download inside the app.
 *
 * The Android app cannot use that path at all, which is the whole of why downloads worked on the
 * web and did nothing in the APK. A Capacitor WebView has no download manager behind it: a
 * synthetic click on an <a download> is ignored outright, blob: URL or not, with no error to catch
 * and no file to find. Nothing in the page can save a file there. What *can* is the system
 * browser, so on native the signed URL is handed to it and Android's own downloader takes it from
 * there — leaving the app, but actually producing the file.
 */
export async function saveAttachment(
  file: File | null,
  fallbackUrl: string | null,
  name: string,
): Promise<'saved' | 'opened' | 'failed'> {
  if (isNativeRuntime() && fallbackUrl) {
    // Capacitor turns a _blank open into an ACTION_VIEW intent, i.e. the phone's browser.
    window.open(fallbackUrl, '_blank', 'noopener,noreferrer')
    return 'opened'
  }

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
