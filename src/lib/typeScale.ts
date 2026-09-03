import type { FontRole } from './fonts'

/**
 * The adjustments that sit on top of a chosen face.
 *
 * A face is a shape; this is how much air it is given. They are separate decisions and separate
 * settings for the same reason the three faces are separate from each other — somebody who reads
 * best with wide tracking wants it whatever face they picked, and picking a new face should not
 * quietly undo it.
 *
 * Everything here is an *offset from the shipped look*, never an absolute. A default of zero means
 * the app looks exactly as it did before any of this existed, which is what makes the whole feature
 * safe to add to a design that was already tuned: nothing moves until somebody moves it.
 */
export type TypeMetric = 'size' | 'letterSpacing' | 'wordSpacing'

export interface TypeMetricSpec {
  id: TypeMetric
  label: string
  /** What it does, said to somebody deciding — not "adjusts the tracking in ems". */
  hint: string
  min: number
  max: number
  step: number
  /** The shipped look. Always the value that changes nothing. */
  base: number
  /**
   * Which of the three roles offers it.
   *
   * Size is notes only, and that is a limitation rather than a decision: the interface and the
   * headings are set in hardcoded pixels in several hundred places, so there is no single number to
   * multiply — scaling them would mean `zoom` on the whole shell, which also scales icons, spacing
   * and the fixed bottom bar's positioning context. Note text runs through one CSS rule, so there
   * it is a real font-size and behaves like one.
   */
  roles: FontRole[]
  /** How the number reads on screen. */
  format: (value: number) => string
}

/** Two decimals at most, and no trailing zeros — "+0.05em", not "+0.050000000000000004em". */
function em(value: number): string {
  if (value === 0) {
    return 'Default'
  }
  const rounded = Math.round(value * 1000) / 1000
  return `${rounded > 0 ? '+' : ''}${rounded}em`
}

export const TYPE_METRICS: TypeMetricSpec[] = [
  {
    id: 'size',
    label: 'Text size',
    hint: 'How large the text inside a note is, in the editor and on its card.',
    min: 0.75,
    max: 1.75,
    step: 0.05,
    base: 1,
    roles: ['note'],
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    id: 'letterSpacing',
    label: 'Letter spacing',
    hint: 'The air between individual letters. A little extra can make a tight face easier to read.',
    min: -0.03,
    max: 0.12,
    step: 0.005,
    base: 0,
    roles: ['body', 'note', 'heading'],
    format: em,
  },
  {
    id: 'wordSpacing',
    label: 'Word spacing',
    hint: 'The gap between words. Widening it separates a dense line into its parts.',
    min: -0.05,
    max: 0.5,
    step: 0.01,
    base: 0,
    roles: ['body', 'note', 'heading'],
    format: em,
  },
]

const BY_ID = new Map(TYPE_METRICS.map((metric) => [metric.id, metric]))

/** The metrics a given role offers, in the order they are shown. */
export function metricsFor(role: FontRole): TypeMetricSpec[] {
  return TYPE_METRICS.filter((metric) => metric.roles.includes(role))
}

export function typeMetricSpec(metric: TypeMetric): TypeMetricSpec {
  return BY_ID.get(metric)!
}

/**
 * Inside the offered range, and snapped to the step.
 *
 * Applied on read as well as on write: these end up in a CSS `calc`, and a hand-edited or
 * out-of-date stored value would otherwise be able to set the note face to 40% of its size with no
 * control on screen able to reach far enough back to undo it.
 */
export function clampTypeMetric(metric: TypeMetric, value: number): number {
  const spec = typeMetricSpec(metric)
  if (!Number.isFinite(value)) {
    return spec.base
  }
  const snapped = Math.round(value / spec.step) * spec.step
  const bounded = Math.min(Math.max(snapped, spec.min), spec.max)
  // Back through the step size, because the arithmetic above reintroduces float dust that then
  // travels into the stored string and out again into a CSS value.
  return Math.round(bounded * 1000) / 1000
}

/** `type_note_size`, `type_body_letter_spacing` — the same snake_case shape as every other key. */
function keyFor(role: FontRole, metric: TypeMetric): string {
  const suffix = metric === 'letterSpacing' ? 'letter_spacing' : metric === 'wordSpacing' ? 'word_spacing' : 'size'
  return `type_${role}_${suffix}`
}

export function readTypeMetric(
  role: FontRole,
  metric: TypeMetric,
  metadata: Record<string, unknown> | undefined,
): number {
  const spec = typeMetricSpec(metric)
  if (!spec.roles.includes(role)) {
    return spec.base
  }
  const raw = metadata?.[keyFor(role, metric)]
  // Stored as a string, because user metadata is written as one — but tolerant of a number, since
  // that is what an earlier hand-written value or a future writer would most naturally put there.
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
  return clampTypeMetric(metric, value)
}

export interface TypeAdjustments {
  size: number
  letterSpacing: number
  wordSpacing: number
}

export function readTypeAdjustments(
  role: FontRole,
  metadata: Record<string, unknown> | undefined,
): TypeAdjustments {
  return {
    size: readTypeMetric(role, 'size', metadata),
    letterSpacing: readTypeMetric(role, 'letterSpacing', metadata),
    wordSpacing: readTypeMetric(role, 'wordSpacing', metadata),
  }
}

/** True when this role is still exactly as it shipped — what the "Reset" control keys off. */
export function isDefaultTypeAdjustment(adjustments: TypeAdjustments): boolean {
  return TYPE_METRICS.every((metric) => adjustments[metric.id] === metric.base)
}

export function typeMetricUpdate(
  role: FontRole,
  metric: TypeMetric,
  value: number,
): Record<string, string> {
  return { [keyFor(role, metric)]: String(clampTypeMetric(metric, value)) }
}

/** Every key for one role, set back to its shipped value. */
export function typeResetUpdate(role: FontRole): Record<string, string> {
  const update: Record<string, string> = {}
  for (const metric of TYPE_METRICS) {
    if (metric.roles.includes(role)) {
      update[keyFor(role, metric.id)] = String(metric.base)
    }
  }
  return update
}
