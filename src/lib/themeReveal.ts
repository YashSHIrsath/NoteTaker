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

/**
 * The box the circle is measured against.
 *
 * `documentElement.clientWidth/clientHeight`, not `window.innerWidth/innerHeight`. Those two are
 * the same number on a desktop and different ones on a phone: `window.inner*` is the *visual*
 * viewport, which shrinks under the URL bar, the on-screen keyboard and pinch-zoom, while
 * `getBoundingClientRect()` and the view transition's own snapshot both work in the *layout*
 * viewport. Mixing the two puts the circle's centre somewhere the button isn't — and only ever on
 * a phone, because only there do they disagree.
 */
function viewportBox(): { width: number; height: number } {
  const root = document.documentElement
  return {
    width: root.clientWidth || window.innerWidth,
    height: root.clientHeight || window.innerHeight,
  }
}

/** Far enough for the circle to clear whichever corner is furthest from the origin. */
function radiusFrom(
  { x, y }: RevealOrigin,
  { width, height }: { width: number; height: number },
): number {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y))
}

export function revealThemeChange(apply: () => void, origin?: RevealOrigin): void {
  if (!supported()) {
    apply()
    return
  }

  const box = viewportBox()
  const from: RevealOrigin = origin ?? { x: box.width / 2, y: box.height / 2 }
  const root = document.documentElement

  // Suppresses the body's own colour transition and the default cross-fade for the duration —
  // either one fading underneath the circle would muddy the edge we're animating.
  root.dataset.themeRevealing = ''

  /*
   * Percentages of the pseudo-element's own box, not pixels.
   *
   * The three numbers are read by a clip-path on ::view-transition-new(root), so they are resolved
   * against *that* box — the snapshot containing block — and nothing guarantees it is the same size
   * as the viewport we measured the button in. On Android it routinely isn't: the app draws
   * edge-to-edge, and the snapshot spans room the page's own coordinates never cover. In pixels
   * that mismatch is a silent offset, which is exactly the "reveal starts nowhere near the button"
   * this is fixing. As a fraction it cannot be one: 84% across is 84% across of whichever box the
   * browser hands us.
   *
   * The radius is a fraction of the same box for the same reason. A percentage radius in `circle()`
   * is resolved against sqrt(w² + h²) / sqrt(2), so that — not the width — is what it is divided by.
   */
  const reference = Math.hypot(box.width, box.height) / Math.SQRT2
  const percent = (value: number, of: number) => `${of > 0 ? (value / of) * 100 : 50}%`

  // Set before the transition starts, not after: these are what the keyframes are made of, so
  // they have to be in effect by the time the pseudo-elements are created.
  root.style.setProperty('--theme-reveal-x', percent(from.x, box.width))
  root.style.setProperty('--theme-reveal-y', percent(from.y, box.height))
  root.style.setProperty('--theme-reveal-r', percent(radiusFrom(from, box), reference))

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
