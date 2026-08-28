import { useState } from 'react'
import { Check } from 'lucide-react'
import type { SidebarNavId } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import {
  DEFAULT_PAGE_CHOICES,
  NAV_DESTINATIONS,
  readDefaultPage,
  resolveNavOrder,
  type NavId,
} from '../../lib/navOrder'
import { cn } from '../../lib/cn'
import { NavOrderList } from './NavOrderList'

/**
 * Which page the app opens on, and what order the bottom bar's tabs sit in.
 *
 * The order is not only cosmetic: it is the coordinate system the page transitions use, so moving
 * a tab also changes which side that page slides in from. Both read the same list (lib/navOrder),
 * which is what stopped the two disagreeing — the bar and the animation used to keep separate
 * hardcoded copies, and Starred and Tasks were swapped between them.
 *
 * Reordering is a drag (see NavOrderList), with the arrow keys on the focused grip as the
 * equivalent keyboard path — a drag that only works with a pointer would leave this list visible
 * to everyone and rearrangeable by some.
 */
export function NavigationSettings() {
  const { user, updateProfile } = useAuth()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const order = resolveNavOrder(metadata)
  const defaultPage = readDefaultPage(metadata)

  const save = async (update: { navOrder?: NavId[]; defaultPage?: SidebarNavId }) => {
    setSaving(true)
    setError(null)
    try {
      await updateProfile(update)
    } catch (cause) {
      // The real message, not a guess at one. "Check your connection" was wrong every time the
      // cause was something else — and Supabase rate-limits account updates, which a few quick
      // drags in a row will hit.
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Could not save that. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-6">
      {/* ---------------------------------------------------------- opens on */}
      <div>
        <p className="text-[13px] font-semibold text-[var(--color-text)]">Open on</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
          The page you land on when you start the app.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {DEFAULT_PAGE_CHOICES.map((id) => {
            const active = defaultPage === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                disabled={saving}
                onClick={() => void save({ defaultPage: id })}
                className={cn(
                  'anim-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  'disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                )}
              >
                {active ? <Check className="h-3 w-3" aria-hidden /> : null}
                {NAV_DESTINATIONS[id].label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------ bar order */}
      <div>
        <p className="text-[13px] font-semibold text-[var(--color-text)]">Navigation order</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
          Drag to rearrange. This sets the bottom bar on a phone and the sidebar on a wide screen —
          and it is the order pages slide in from, so a tab you move left will arrive from the left.
        </p>
        <NavOrderList order={order} disabled={saving} onReorder={(next) => save({ navOrder: next })} />
      </div>

      {error ? (
        <p className="rounded-xl bg-[var(--color-danger)]/10 px-3 py-2 text-[12px] text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
