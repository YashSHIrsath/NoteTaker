import { useEffect } from 'react'
import { useAuth } from './useAuth'
import { ensureFont, readFontChoice, type FontOption } from '../lib/fonts'
import { readTypeAdjustments } from '../lib/typeScale'

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
  const bodyType = readTypeAdjustments('body', metadata)
  const headingType = readTypeAdjustments('heading', metadata)
  const noteType = readTypeAdjustments('note', metadata)

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
    /*
     * The account's own tracking is added on top of the mono correction, not swapped in over it.
     *
     * They answer different questions — one is the face compensating for itself, the other is a
     * preference about that face — and `calc()` is what lets both stay true at once instead of a
     * choice between "my spacing" and "a monospace that doesn't run together".
     */
    root.style.setProperty(
      '--font-body-tracking',
      bodyType.letterSpacing === 0 && !isMono
        ? 'normal'
        : `calc(${isMono ? '-0.012em' : '0em'} + ${bodyType.letterSpacing}em)`,
    )
    root.style.setProperty('--font-body-word-spacing', `${bodyType.wordSpacing}em`)
    return () => {
      root.style.removeProperty('--font-body')
      root.style.removeProperty('--font-body-tracking')
      root.style.removeProperty('--font-body-word-spacing')
    }
  }, [body, bodyType.letterSpacing, bodyType.wordSpacing])

  useEffect(() => {
    ensureFont(heading)
    const root = document.documentElement
    root.style.setProperty('--font-display', heading.stack)
    root.style.setProperty('--font-display-tracking', `${headingType.letterSpacing}em`)
    root.style.setProperty('--font-display-word-spacing', `${headingType.wordSpacing}em`)
    return () => {
      root.style.removeProperty('--font-display')
      root.style.removeProperty('--font-display-tracking')
      root.style.removeProperty('--font-display-word-spacing')
    }
  }, [heading, headingType.letterSpacing, headingType.wordSpacing])

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
    // The one role with a real size to scale — see lib/typeScale for why the other two do not
    // get this property at all.
    root.style.setProperty('--font-note-size-scale', String(noteType.size))
    root.style.setProperty('--font-note-tracking', `${noteType.letterSpacing}em`)
    root.style.setProperty('--font-note-word-spacing', `${noteType.wordSpacing}em`)
    return () => {
      root.style.removeProperty('--font-note')
      root.style.removeProperty('--font-note-size-scale')
      root.style.removeProperty('--font-note-tracking')
      root.style.removeProperty('--font-note-word-spacing')
    }
  }, [note, noteType.size, noteType.letterSpacing, noteType.wordSpacing])

  return { body, heading, note }
}
