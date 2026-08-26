/**
 * Runs a theme change as a circular reveal spreading from the control that triggered it, instead
 * of the whole app repainting at once.
 *
 * It leans on the View Transitions API: the browser snapshots the page, we swap the theme, and
 * then the *new* snapshot is clipped to a circle that grows from the click point past the far
 * corner. That's what makes it read as the new theme flooding outwards — a hand-rolled version
 * would have to duplicate the entire UI in both themes to get the same effect.
 *
 * Everything this file does is write three numbers and start the transition. The animation itself
 * is a CSS rule on ::view-transition-new(root) in index.css that reads them. That split is
 * deliberate: an earlier version attached the animation from script, on transition.ready, and the
 * first switch of a session could land before the properties it depended on were in effect — a
 * race a stylesheet cannot lose, because the animation is part of the pseudo-element's computed
 * style from the first frame it exists.
 *
 * Where the API is missing (Safari < 18, Firefox) or motion is turned down, `apply` just runs and
 * the switch is instant, exactly as it was before.
 */

type StartViewTransition = (callback: () => void) => {
  finished: Promise<void>
}

/** The point the circle grows from, in viewport coordinates. */
export interface RevealOrigin {
  x: number
  y: number
}

function supported(): boolean {
  return (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Far enough for the circle to clear whichever corner is furthest from the origin. */
function radiusFrom({ x, y }: RevealOrigin): number {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
}

export function revealThemeChange(apply: () => void, origin?: RevealOrigin): void {
  if (!supported()) {
    apply()
    return
  }

  const from: RevealOrigin = origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  const root = document.documentElement

  // Suppresses the body's own colour transition and the default cross-fade for the duration —
  // either one fading underneath the circle would muddy the edge we're animating.
  root.dataset.themeRevealing = ''

  // Set before the transition starts, not after: these are what the keyframes are made of, so
  // they have to be in effect by the time the pseudo-elements are created.
  root.style.setProperty('--theme-reveal-x', `${from.x}px`)
  root.style.setProperty('--theme-reveal-y', `${from.y}px`)
  root.style.setProperty('--theme-reveal-r', `${radiusFrom(from)}px`)

  const start = (document as unknown as { startViewTransition: StartViewTransition })
    .startViewTransition

  const transition = start.call(document, apply)

  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      delete root.dataset.themeRevealing
      root.style.removeProperty('--theme-reveal-x')
      root.style.removeProperty('--theme-reveal-y')
      root.style.removeProperty('--theme-reveal-r')
    })
}

/** The centre of the control that was clicked — where the reveal should start from. */
export function originFromElement(element: Element | null): RevealOrigin | undefined {
  if (!element) {
    return undefined
  }
  const rect = element.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}
