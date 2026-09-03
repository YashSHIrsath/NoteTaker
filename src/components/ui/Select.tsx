import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import { cn } from '../../lib/cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export interface SelectProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: readonly SelectOption<T>[]
  id?: string
  disabled?: boolean
  /** Read by whatever <label> already names the field — a native select needed nothing more, and
   *  a bare button needs the same thing said explicitly. */
  'aria-label'?: string
  /** Styles the trigger; the popover beneath it is fixed, matching every other menu in the app. */
  className?: string
}

const MIN_PANEL_WIDTH = 140

/**
 * The app's own dropdown, standing in for `<select>`.
 *
 * A native select's *closed* state can be styled — every FIELD-classed one in this app already
 * did that much — but the open list cannot be touched at all: no rounded corners, no accent
 * hover, no theme, occasionally not even the same typeface, because it is drawn by the OS rather
 * than the page. That mismatch is what this replaces, using the identical anchored-portal-menu
 * shape already proven three times over in this app (WorkspaceSwitcher, ThemeSwitcher,
 * TaskActionsMenu) rather than a fourth, slightly different popover implementation.
 *
 * `role="listbox"`/`"option"` rather than the menu-role those three use: this picks a *value*,
 * which is what a listbox means, where a menu is a list of actions to perform. `<select>` itself
 * is exposed the same way under the hood.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  disabled = false,
  className,
  ...aria
}: SelectProps<T>) {
  const panel = useAnchoredPanel<HTMLButtonElement>(MIN_PANEL_WIDTH)
  // The list's own width, measured from the trigger the instant it opens — a dropdown narrower
  // than the control it hangs from reads as a mistake, the way a native select's never is.
  const [panelWidth, setPanelWidth] = useState(MIN_PANEL_WIDTH)
  const current = options.find((option) => option.value === value)

  const openPanel = () => {
    const width = panel.anchorRef.current?.getBoundingClientRect().width
    if (width) {
      setPanelWidth(Math.max(width, MIN_PANEL_WIDTH))
    }
    panel.setOpen(true)
  }

  return (
    <>
      <button
        ref={panel.anchorRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={panel.open}
        aria-label={aria['aria-label']}
        disabled={disabled}
        onClick={() => (panel.open ? panel.setOpen(false) : openPanel())}
        className={cn(
          // No width of its own: `cn` is a plain join with no Tailwind-aware merging, so a fixed
          // `w-full` here would sit in the class string alongside a caller's own `w-auto` rather
          // than losing to it, and which one actually wins would come down to Tailwind's own
          // generation order rather than anything either caller or component intended. Every
          // consumer states its own width instead — most want `w-full` beside sibling FIELD
          // inputs, one wants to stay pill-sized to its label the way the select it replaced did.
          'flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{current?.label ?? value}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform duration-150',
            panel.open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {panel.open && panel.position
        ? createPortal(
            <div
              ref={panel.panelRef}
              role="listbox"
              aria-label={aria['aria-label']}
              className="anim-panel-in fixed z-[60] overflow-y-auto overscroll-contain rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
              style={{
                top: panel.position.top,
                left: panel.position.left,
                width: panelWidth,
                maxHeight: panel.position.maxHeight,
              }}
            >
              {options.map((option) => {
                const selected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      panel.setOpen(false)
                      if (option.value !== value) {
                        onChange(option.value)
                      }
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors',
                      selected
                        ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent-ink)]'
                        : 'text-[var(--color-text)] hover:bg-[var(--color-hover)]',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
