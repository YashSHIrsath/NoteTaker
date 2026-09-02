import { useEffect } from 'react'
import { useAuth } from './useAuth'
import { readFontChoice, type FontOption } from '../lib/fonts'

/**
 * Fetch a face, once per family, and never fetch it twice.
 *
 * The <link> is left in the document rather than removed when the choice changes. Removing it would
 * evict the face while the next paint may still reference it, and the round trip is already paid —
 * so a session that tries four fonts ends with four stylesheets and no flashes, which is the right
 * trade for a settings screen somebody is actively browsing.
 */
function ensureFont(option: FontOption): void {
  if (!option.google) {
    return
  }
  const id = `font-${option.id}`
  if (document.getElementById(id)) {
    return
  }
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${option.google}&display=swap`
  document.head.append(link)
}

/**
 * Puts the account's chosen faces on the document, and takes them off on the way out.
 *
 * On `<html>` rather than on a container, for the same reason `data-theme` is: every menu, dialog and
 * picker in this app portals to `<body>`, so a font scoped to the app's own subtree would leave every
 * popover in the other face.
 *
 * Called from inside the authenticated shell, which is what keeps it off the landing page — a visitor
 * reads the marketing copy in the faces it was written for, whatever the account behind it prefers.
 * The cleanup is the other half of that: sign out, and the overrides come off as the shell unmounts.
 *
 * --font-brand is untouched by any of this. The wordmark is set in it precisely so that a preference
 * cannot reach it.
 */
export function useAppFonts(): { body: FontOption; heading: FontOption; note: FontOption } {
  const { user } = useAuth()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const body = readFontChoice('body', metadata)
  const heading = readFontChoice('heading', metadata)
  const note = readFontChoice('note', metadata)

  useEffect(() => {
    ensureFont(body)
    const root = document.documentElement
    root.style.setProperty('--font-body', body.stack)
    /*
     * Mono needs the tracking pulled in.
     *
     * A monospace at the same nominal size reads wider and looser than a proportional face — no
     * kerning is doing any work — so without this, switching to one silently reflows every card to a
     * shorter line. Keyed off the fallback in the stack rather than off a flag, so a mono added to the
     * catalogue later gets it for free.
     */
    const isMono = body.stack.includes('ui-monospace')
    root.style.setProperty('--font-body-tracking', isMono ? '-0.012em' : 'normal')
    return () => {
      root.style.removeProperty('--font-body')
      root.style.removeProperty('--font-body-tracking')
    }
  }, [body])

  useEffect(() => {
    ensureFont(heading)
    const root = document.documentElement
    root.style.setProperty('--font-display', heading.stack)
    return () => {
      root.style.removeProperty('--font-display')
    }
  }, [heading])

  /*
   * The note face, which is usually the reading face and does not have to be.
   *
   * Set unconditionally rather than only when it differs: --font-note falls back to --font-body in
   * the stylesheet, and leaving it unset would work right up until somebody picked a note face and
   * then cleared it. One property, always written, always removed.
   */
  useEffect(() => {
    ensureFont(note)
    const root = document.documentElement
    root.style.setProperty('--font-note', note.stack)
    return () => {
      root.style.removeProperty('--font-note')
    }
  }, [note])

  return { body, heading, note }
}
