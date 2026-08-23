/**
 * Runs a theme change as a circular reveal spreading from the control that triggered it, instead
 * of the whole app repainting at once.
 *
 * It leans on the View Transitions API: the browser snapshots the page, we swap the theme, and
 * then the *new* snapshot is clipped to a circle that grows from the click point past the far
 * corner. That's what makes it read as the new theme flooding outwards — a hand-rolled version
 * would have to duplicate the entire UI in both themes to get the same effect.
 *
 * Where the API is missing (Safari < 18, Firefox) or motion is turned down, `apply` just runs and
 * the switch is instant, exactly as it was before.
 */

/** If --motion-reveal can't be read for any reason. */
const FALLBACK_MS = 1100

/**
 * The duration lives in index.css with every other timing in the app; this reads it back rather
 * than keeping a second copy in sync by hand. The build minifies `1100ms` to `1.1s`, so both
 * units have to be understood.
 */
function durationMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--motion-reveal').trim()
  const value = raw.endsWith('ms')
    ? Number.parseFloat(raw)
    : raw.endsWith('s')
      ? Number.parseFloat(raw) * 1000
      : Number.NaN
  return Number.isFinite(value) && value > 0 ? value : FALLBACK_MS
}

type StartViewTransition = (callback: () => void) => {
  ready: Promise<void>
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

  const start = (document as unknown as { startViewTransition: StartViewTransition })
    .startViewTransition

  const transition = start.call(document, apply)

  void transition.ready
    .then(() => {
      const radius = radiusFrom(from)
      root.animate(
        {
          clipPath: [
            `circle(0px at ${from.x}px ${from.y}px)`,
            `circle(${radius}px at ${from.x}px ${from.y}px)`,
          ],
        },
        {
          duration: durationMs(),
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
          // The old theme stays put underneath; only the incoming one is clipped.
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
    .catch(() => undefined)

  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      delete root.dataset.themeRevealing
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
