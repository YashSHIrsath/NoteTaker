/**
 * Where a confirmation / recovery email should send the user back to.
 *
 * VITE_PUBLIC_APP_URL wins when it's set, because the current origin is the wrong answer in two
 * common cases: signing up against the dev server mails a localhost link that only works on that
 * machine, and the packaged app's origin is `capacitor://localhost`, which isn't a usable link at
 * all. Falls back to the origin so a plain web deploy needs no configuration.
 */
export function getAuthEmailRedirectTo(): string {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL
  const base = (typeof configured === 'string' && configured.trim() ? configured : window.location.origin)
    .trim()
    .replace(/\/+$/, '')
  return `${base}/login`
}
