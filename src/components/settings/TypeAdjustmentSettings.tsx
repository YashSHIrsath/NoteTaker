import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { readFontChoice, type FontRole } from '../../lib/fonts'
import {
  isDefaultTypeAdjustment,
  metricsFor,
  readTypeAdjustments,
  typeMetricSpec,
  type TypeAdjustments,
  type TypeMetric,
} from '../../lib/typeScale'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'

/** How long a drag goes quiet before it becomes a write. A slider fires an onChange per pixel, and
 *  Supabase's `updateUser` is a real round trip — one request at the end of a drag instead of one
 *  per pixel is the difference between a setting and a denial-of-service against your own account. */
const COMMIT_MS = 350

const ROLE_TABS: { role: FontRole; label: string }[] = [
  { role: 'body', label: 'Interface' },
  { role: 'note', label: 'Notes' },
  { role: 'heading', label: 'Headings' },
]

/**
 * A line of real UI set in the role's own face, carrying whatever is being dragged right now.
 *
 * Local state, not the stored metadata: the account-wide effect is debounced (see COMMIT_MS) so a
 * drag does not become a request storm, but a slider that visibly lags the finger reads as broken
 * regardless of why. This is what lets the on-screen number and the round trip disagree for a few
 * hundred milliseconds without the control feeling unresponsive.
 */
function Sample({
  role,
  adjustments,
  metadata,
}: {
  role: FontRole
  adjustments: TypeAdjustments
  metadata: Record<string, unknown> | undefined
}) {
  // The face actually chosen, not the role's default — a sample previewing the wrong typeface
  // while somebody adjusts its spacing is worse than no preview at all.
  const face = readFontChoice(role, metadata)
  const style = {
    fontFamily: face.stack,
    letterSpacing: `${adjustments.letterSpacing}em`,
    wordSpacing: `${adjustments.wordSpacing}em`,
  }
  if (role === 'note') {
    return (
      <p
        className="text-[16px] leading-relaxed text-[var(--color-text)]"
        style={{ ...style, fontSize: `${16 * adjustments.size}px` }}
      >
        Three questions to have ready before Friday, and the sync design to walk through.
      </p>
    )
  }
  if (role === 'heading') {
    return (
      <p className="text-[19px] font-bold text-[var(--color-text)]" style={style}>
        Interview prep
      </p>
    )
  }
  return (
    <p className="text-[13px] font-medium text-[var(--color-text)]" style={style}>
      Notes → Job hunt · 2 days left · 1 of 3 done
    </p>
  )
}

/** One slider, its current reading, and — for `note`'s size — the one metric with a unit worth
 *  spelling out beside the number. */
function MetricRow({
  role,
  metric,
  value,
  onChange,
}: {
  role: FontRole
  metric: TypeMetric
  value: number
  onChange: (value: number) => void
}) {
  const spec = typeMetricSpec(metric)
  const id = `type-${role}-${metric}`
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12.5px] font-semibold text-[var(--color-text)]">
          {spec.label}
        </label>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {spec.format(value)}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">{spec.hint}</p>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="app-range mt-0.5"
      />
    </div>
  )
}

/**
 * Text size, letter spacing and word spacing — the fit and finish underneath which *face* is
 * chosen. See FontSettings for the face itself; this is a separate card because they are separate
 * questions, the same way a font and its size are two different menus in every other place that
 * offers both.
 *
 * Size is offered for Notes only. The interface and the headings set their type in fixed pixels
 * across several hundred places in this codebase with no single number to multiply — scaling them
 * for real is a much larger change than this control is. Note text runs through one CSS rule (see
 * TaskBlockNoteEditor.css), so it is the one place a size slider can be honest about what it does.
 * Letter and word spacing have no such obstacle and are offered for all three.
 *
 * Personal, never a space's — the same reasoning as the face itself in FontSettings.
 */
export function TypeAdjustmentSettings() {
  const { user, updateProfile } = useAuth()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const [role, setRole] = useState<FontRole>('body')

  // Local, so a drag is instant; committed to the account on a debounce (see COMMIT_MS). Reseeded
  // from the stored value whenever the role tab changes or the account's own value moves out from
  // under it — a save from another tab, or this device's own commit landing.
  const [draft, setDraft] = useState<TypeAdjustments>(() => readTypeAdjustments(role, metadata))
  const commitTimer = useRef<number | null>(null)

  useEffect(() => {
    setDraft(readTypeAdjustments(role, metadata))
    // Switching roles must not carry the previous role's pending write with it — a timer armed for
    // 'body' should not fire a 'note' update because the tab changed underneath it.
    return () => {
      if (commitTimer.current !== null) {
        window.clearTimeout(commitTimer.current)
        commitTimer.current = null
      }
    }
    // metadata is intentionally excluded: it changes on every keystroke of every *other* setting
    // that touches the profile too (theme, nav order, tiles per row), and re-seeding the draft
    // from it mid-drag would snap the slider back to the last committed value on every one of those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  const applyAndCommit = (metric: TypeMetric, value: number) => {
    setDraft((current) => ({ ...current, [metric]: value }))
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current)
    }
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null
      void updateProfile({ typeMetric: { role, metric, value } }).catch(() => undefined)
    }, COMMIT_MS)
  }

  const reset = () => {
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current)
      commitTimer.current = null
    }
    const spec = metricsFor(role)
    setDraft((current) => {
      const next = { ...current }
      for (const metric of spec) {
        next[metric.id] = metric.base
      }
      return next
    })
    void updateProfile({ resetTypeMetrics: role }).catch(() => undefined)
  }

  const atDefault = isDefaultTypeAdjustment(draft)

  return (
    <div className="mt-4">
      <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
        Fit and finish on top of whichever face you picked above — how large your notes read, and
        how much air sits between letters and words.
      </p>

      <div
        role="tablist"
        aria-label="Which text to adjust"
        className="mt-3 flex rounded-full bg-[var(--color-surface-muted)] p-0.5"
      >
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.role}
            type="button"
            role="tab"
            aria-selected={role === tab.role}
            onClick={() => setRole(tab.role)}
            className={cn(
              'anim-press flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
              role === tab.role
                ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <Sample role={role} adjustments={draft} metadata={metadata} />
        </div>

        <div className="mt-3.5 flex flex-col gap-3.5">
          {metricsFor(role).map((metric) => (
            <MetricRow
              key={metric.id}
              role={role}
              metric={metric.id}
              value={draft[metric.id]}
              onChange={(value) => applyAndCommit(metric.id, value)}
            />
          ))}
        </div>

        <div className="mt-3.5 flex justify-end border-t border-[var(--color-border)] pt-3">
          <Button variant="ghost" size="sm" onClick={reset} disabled={atDefault}>
            <span className="inline-flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset to default
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}
