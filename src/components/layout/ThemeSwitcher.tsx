import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, Moon, Sun } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import { useTheme } from '../../hooks/useTheme'
import { nextTheme, quickThemes, themeOption, type ThemeOption } from '../../lib/themes'
import { originFromElement } from '../../lib/themeReveal'
import { cn } from '../../lib/cn'

const PANEL_WIDTH = 200

/**
 * How long the menu waits after the pointer leaves before closing.
 *
 * Not politeness — correctness. The panel is portalled to the body, so travelling from the button to
 * the first row means leaving one element and entering another, and there is a frame in between where
 * the pointer is over neither. Without the grace period the menu shut on the way to it.
 */
const CLOSE_DELAY = 140

/**
 * The theme control: a button that changes it, and a menu that shows what to.
 *
 * The button is the one that was always here, doing what it always did — press it and the theme
 * changes, no menu, no decision. That is right because it is what anybody wants nine times out of
 * ten, and with five themes it is also not enough on its own: a toggle can only ever offer "the
 * other one", and three of the five are near-blacks whose names alone do not tell them apart.
 *
 * So hovering it opens the list. The list only *shows* — hovering a row highlights it and nothing
 * else. An earlier version repainted the whole app under the pointer as a live preview, which read
 * as the theme having already changed by accident. The menu is for finding the one you want;
 * changing is what a click is for.
 *
 * Right-aligned to the button by useAnchoredPanel, so it grows leftward out of the corner rather
 * than off the edge of the screen.
 *
 * Which themes it lists is a setting — see ThemeSettings. The theme in force is always among them,
 * so the list can never be one you cannot find yourself in.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, isDark, setTheme, quickThemeIds } = useTheme()
  // Anchored on the wrapper rather than the button: IconButton does not forward a ref, and the
  // wrapper is the same box anyway — it is what the pointer has to stay inside.
  const panel = useAnchoredPanel<HTMLDivElement>(PANEL_WIDTH)
  const shown = quickThemes(quickThemeIds, theme)
  const upNext = themeOption(nextTheme(quickThemeIds, theme))
  const closeTimer = useRef<number | null>(null)
  /** What opened the last press. A click carries no pointer type of its own, and the button does two
   *  different things depending on it — see the press handler. */
  const pressedWith = useRef<string | null>(null)

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const open = () => {
    cancelClose()
    // A one-item menu says only what the icon already says. When everything but the current theme has
    // been unchecked the button is the whole control, and it still cycles — nextTheme falls back to
    // the full catalogue rather than pressing to nowhere.
    if (shown.length < 2) {
      return
    }
    panel.setOpen(true)
  }

  const close = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      panel.setOpen(false)
    }, CLOSE_DELAY)
  }

  /*
   * Hover, and only hover.
   *
   * A tap fires pointerenter and pointerleave too, and both would be wrong here: the first would open
   * the menu behind the press and the second would shut it again the moment the finger lifted. So
   * every hover handler is gated on the pointer actually being a pointer.
   */
  const mouseOnly = (run: () => void) => (event: ReactPointerEvent) => {
    if (event.pointerType === 'mouse') {
      run()
    }
  }

  /**
   * The press, which means two different things depending on what pressed it.
   *
   * With a mouse or a keyboard the list is already reachable — hover or focus opens it — so the
   * button keeps the job it has always had: press it, the theme changes.
   *
   * On a touch screen there is no hover, so the same press has to be the way *in* to the list.
   * Cycling would be the alternative and it is a bad one: six themes means up to five taps to reach
   * the one you want, each of them repainting the whole app on the way past. Tapping opens the menu
   * and the next tap picks — two taps to anywhere, and you can see where you are going.
   */
  const onPress = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const touched = pressedWith.current === 'touch' || pressedWith.current === 'pen'
    pressedWith.current = null
    if (touched) {
      if (panel.open) {
        cancelClose()
        panel.setOpen(false)
      } else {
        open()
      }
      return
    }
    setTheme(upNext.id, originFromElement(event.currentTarget))
  }

  return (
    <>
      <div
        ref={panel.anchorRef}
        className={cn('relative flex shrink-0 items-center', className)}
        onPointerDown={(event) => {
          pressedWith.current = event.pointerType
        }}
        onPointerEnter={mouseOnly(open)}
        onPointerLeave={mouseOnly(close)}
        // Keyboard gets the same menu, and leaving the cluster closes it. Without this the list would
        // be mouse-only, which for five themes means four of them are unreachable from here.
        //
        // Gated on :focus-visible, which is precisely "focus that deserves to be shown" — a click and
        // a tap both focus the button too, and neither should leave a menu hanging open behind a
        // theme that has already changed.
        onFocus={(event) => {
          if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
            open()
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            close()
          }
        }}
      >
        <IconButton
          label={`Theme: ${themeOption(theme).label}. Switch to ${upNext.label}, or open the list`}
          aria-expanded={panel.open}
          aria-haspopup="menu"
          onClick={onPress}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </IconButton>
      </div>

      {panel.open && panel.position
        ? createPortal(
            <div
              ref={panel.panelRef}
              role="menu"
              aria-label="Theme"
              // The panel is outside the wrapper in the DOM, so it carries the same handlers: the
              // pointer moving onto it has to count as staying, not as leaving.
              onPointerEnter={mouseOnly(cancelClose)}
              onPointerLeave={mouseOnly(close)}
              className={cn(
                'anim-panel-in-right fixed z-[60] flex flex-col overflow-hidden rounded-2xl p-1',
                'border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]',
              )}
              style={{
                top: panel.position.top,
                left: panel.position.left,
                width: PANEL_WIDTH,
                maxHeight: panel.position.maxHeight,
              }}
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {shown.map((option) => {
                  const active = option.id === theme
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={(event) => {
                        setTheme(option.id, originFromElement(event.currentTarget))
                        // Closed on the way out, because on a touch screen there is no pointer to
                        // move away and nothing else would ever close it.
                        cancelClose()
                        panel.setOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
                        active ? 'bg-[var(--color-accent-soft)]' : 'hover:bg-[var(--color-hover)]',
                      )}
                    >
                      <Swatch theme={option} />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[12.5px] font-semibold',
                          active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]',
                        )}
                      >
                        {option.label}
                      </span>
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]',
                          active ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden
                      />
                    </button>
                  )
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/**
 * One theme as a coin: its own page colour, with its accent as the dot on it.
 *
 * The ground alone is not enough — Studio and Indigo are both near-blacks and would be two identical
 * dark circles. The accent is the part that differs at this size, so it is the part that shows. With
 * no live preview, this swatch is all that stands in for the theme, so it has to carry both.
 *
 * The rim is the theme's own ink at low alpha rather than `--color-border`, because a swatch has to
 * have an edge against *the menu it is sitting in*, and the light ones sit on a light menu.
 */
function Swatch({ theme }: { theme: ThemeOption }) {
  return (
    <span
      className="relative block h-4 w-4 shrink-0 rounded-full"
      style={{
        background: theme.swatch.ground,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${theme.swatch.ink} 30%, transparent)`,
      }}
      aria-hidden
    >
      <span
        className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: theme.swatch.accent }}
      />
    </span>
  )
}
