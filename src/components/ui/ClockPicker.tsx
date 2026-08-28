import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowLeftRight, Minus, Plus } from 'lucide-react'
import {
  angleToStep,
  dialHour,
  dialPoint,
  formatClockTime,
  hourFromDial,
  pointAngle,
  stepAngle,
} from '../../lib/calendar'
import { cn } from '../../lib/cn'

export interface ClockPickerProps {
  hour: number
  minute: number
  onChange: (time: { hour: number; minute: number }) => void
}

/** SVG geometry. One centre, three radii, everything else derived. */
const SIZE = 232
const CENTRE = SIZE / 2
const LABEL_RADIUS = 90
const HAND_LENGTH = 74
const TICK_OUTER = 105
/**
 * The arrowhead, as three radii and a spread.
 *
 * The apex reaches just short of the labels, so the hand points *at* the number rather than covering
 * it — which is what the blob at the tip did: it sat on the very label it had selected and hid it,
 * leaving a filled circle with a digit inside and no way to see what was underneath.
 *
 * The base corners are placed by angle rather than by a perpendicular offset, so the same three
 * numbers work at every position on the dial with no per-angle trigonometry here.
 */
const ARROW_APEX = 84
const ARROW_BASE = HAND_LENGTH - 8
const ARROW_SPREAD = 7.5

type Mode = 'hour' | 'minute'

/**
 * The time, on a clock face.
 *
 * This was a grid of buttons: twenty-four hours and twelve minutes at five-minute steps. Which is
 * fine for a reminder and useless for anything anybody actually looked at a clock for — 1:44 was not
 * expressible at all. A dial has sixty positions and takes no more room than twelve buttons did.
 *
 * Hour first, then minute, switching by itself when you let go of the hour — the order everybody
 * reads a time in, and the same two-stage dial every phone's clock uses. Going back is either half
 * of the readout, or the labelled switch under the face: the readout halves are buttons but nothing
 * about a big number says so, so the switch is the one that can be found.
 *
 * Twelve positions and an AM/PM toggle rather than a twenty-four-hour double ring. The inner ring on
 * those dials is half the size for the same tap, which is the wrong trade on a phone; the readout is
 * formatted by the locale, so a 24-hour locale still reads "13:44".
 *
 * Dragging is not the only way in. A dial is a coarse instrument at sixty positions — six degrees
 * apiece — so the minute has nudges beside it and the whole face takes arrow keys. Somebody who
 * wants exactly 44 should not have to aim for it.
 */
export function ClockPicker({ hour, minute, onChange }: ClockPickerProps) {
  const [mode, setMode] = useState<Mode>('hour')
  const dragging = useRef(false)
  const pm = hour >= 12

  const setFromAngle = (degrees: number) => {
    if (mode === 'hour') {
      onChange({ hour: hourFromDial(angleToStep(degrees, 12), pm), minute })
    } else {
      onChange({ hour, minute: angleToStep(degrees, 60) })
    }
  }

  /** Angle is scale-invariant, so the rendered size of the SVG does not need to be reconciled with
   *  its viewBox — only the centre of its box matters. */
  const angleFromEvent = (event: PointerEvent<SVGSVGElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    return pointAngle(
      event.clientX - (rect.left + rect.width / 2),
      event.clientY - (rect.top + rect.height / 2),
    )
  }

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    // Captured, so a drag that leaves the circle keeps steering it rather than stopping dead at the
    // edge — which is most drags, since the hand is aimed from outside the face.
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    setFromAngle(angleFromEvent(event))
  }

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (dragging.current) {
      setFromAngle(angleFromEvent(event))
    }
  }

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) {
      return
    }
    dragging.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (mode === 'hour') {
      setMode('minute')
    }
  }

  const nudge = (delta: number) => {
    if (mode === 'hour') {
      onChange({ hour: (hour + delta + 24) % 24, minute })
    } else {
      // Wraps the minute without dragging the hour with it: the hour is its own control, and an
      // accidental hour change while fine-tuning 59 → 00 is the kind of thing nobody notices.
      onChange({ hour, minute: (minute + delta + 60) % 60 })
    }
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
          ? -1
          : 0
    if (step !== 0) {
      event.preventDefault()
      nudge(step)
    }
  }

  const handAngle =
    mode === 'hour' ? stepAngle(dialHour(hour), 12) : stepAngle(minute, 60)
  const handTip = dialPoint(CENTRE, HAND_LENGTH, handAngle)
  const arrowApex = dialPoint(CENTRE, ARROW_APEX, handAngle)
  const arrowLeft = dialPoint(CENTRE, ARROW_BASE, handAngle - ARROW_SPREAD)
  const arrowRight = dialPoint(CENTRE, ARROW_BASE, handAngle + ARROW_SPREAD)
  // The other hand, drawn faint. It is what makes this read as a clock rather than as a dial with one
  // pointer on it, and it shows the whole time while only one half is being changed.
  const ghostAngle =
    mode === 'hour' ? stepAngle(minute, 60) : stepAngle(dialHour(hour), 12)
  const ghostTip = dialPoint(CENTRE, mode === 'hour' ? HAND_LENGTH - 16 : HAND_LENGTH - 22, ghostAngle)

  const labels =
    mode === 'hour'
      ? Array.from({ length: 12 }, (_, index) => ({
          step: index,
          steps: 12,
          text: String(index === 0 ? 12 : index),
        }))
      : Array.from({ length: 12 }, (_, index) => ({
          step: index * 5,
          steps: 60,
          text: String(index * 5).padStart(2, '0'),
        }))

  return (
    <div className="flex flex-col items-center gap-3">
      {/* The readout is the control for switching stage — the same affordance every clock picker
        * uses, and the reason no separate tabs are needed for hour and minute. */}
      <div className="flex items-center gap-2">
        <div className="flex items-baseline rounded-xl bg-[var(--color-surface-muted)] px-2 py-1">
          <button
            type="button"
            aria-label="Set the hour"
            aria-pressed={mode === 'hour'}
            onClick={() => setMode('hour')}
            className={cn(
              'rounded-lg px-1.5 text-[26px] font-bold tabular-nums leading-none transition-colors',
              mode === 'hour' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]',
            )}
          >
            {formatClockTime(hour, minute).split(':')[0]}
          </button>
          <span className="text-[26px] font-bold leading-none text-[var(--color-text-muted)]">:</span>
          <button
            type="button"
            aria-label="Set the minute"
            aria-pressed={mode === 'minute'}
            onClick={() => setMode('minute')}
            className={cn(
              'rounded-lg px-1.5 text-[26px] font-bold tabular-nums leading-none transition-colors',
              mode === 'minute' ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]',
            )}
          >
            {String(minute).padStart(2, '0')}
          </button>
        </div>

        {/* Side by side, as one segmented control. Stacked they read as two separate toggles, when
          * the pair is a single either/or. */}
        <div className="flex gap-0.5 rounded-lg bg-[var(--color-surface-muted)] p-0.5">
          {[false, true].map((isPm) => (
            <button
              key={String(isPm)}
              type="button"
              aria-pressed={pm === isPm}
              onClick={() => onChange({ hour: hourFromDial(dialHour(hour), isPm), minute })}
              className={cn(
                'anim-press rounded-md px-2.5 py-1 text-[11.5px] font-bold uppercase transition-colors',
                pm === isPm
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {isPm ? 'pm' : 'am'}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="slider"
        tabIndex={0}
        aria-label={mode === 'hour' ? 'Hour' : 'Minute'}
        aria-valuemin={0}
        aria-valuemax={mode === 'hour' ? 23 : 59}
        aria-valuenow={mode === 'hour' ? hour : minute}
        aria-valuetext={formatClockTime(hour, minute)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        // touch-none, or dragging the hand scrolls the dialog under it on a phone.
        className="h-[232px] w-[232px] max-w-full touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
      >
        <circle cx={CENTRE} cy={CENTRE} r={TICK_OUTER + 6} fill="var(--color-surface-muted)" />

        {/* Sixty ticks in minute mode, twelve in hour mode: the ticks say what the dial is measuring
          * before any number is read, and sixty of them under twelve hour numbers would be noise. */}
        {Array.from({ length: mode === 'minute' ? 60 : 12 }, (_, index) => {
          const steps = mode === 'minute' ? 60 : 12
          const major = mode === 'minute' ? index % 5 === 0 : true
          const angle = stepAngle(index, steps)
          const outer = dialPoint(CENTRE, TICK_OUTER, angle)
          const inner = dialPoint(CENTRE, TICK_OUTER - (major ? 7 : 4), angle)
          return (
            <line
              key={index}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--color-border-strong)"
              strokeWidth={major ? 1.5 : 1}
              strokeLinecap="round"
              opacity={major ? 0.9 : 0.45}
            />
          )
        })}

        {/* The faint hand for whichever half is not being set. */}
        <line
          x1={CENTRE}
          y1={CENTRE}
          x2={ghostTip.x}
          y2={ghostTip.y}
          stroke="var(--color-text-muted)"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.35}
        />

        {/* The live hand: a shaft, an arrowhead, and a pin at the centre. */}
        <line
          x1={CENTRE}
          y1={CENTRE}
          x2={handTip.x}
          y2={handTip.y}
          stroke="var(--color-accent)"
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        <polygon
          points={`${arrowApex.x},${arrowApex.y} ${arrowLeft.x},${arrowLeft.y} ${arrowRight.x},${arrowRight.y}`}
          fill="var(--color-accent)"
        />
        <circle cx={CENTRE} cy={CENTRE} r={4.5} fill="var(--color-accent)" />

        {labels.map((label) => {
          const point = dialPoint(CENTRE, LABEL_RADIUS, stepAngle(label.step, label.steps))
          const onHand =
            mode === 'hour' ? label.step === dialHour(hour) : label.step === minute
          return (
            <text
              key={label.step}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="pointer-events-none"
              // Accent rather than white. White only worked while a filled blob sat behind the
              // label; against the bare face it was the one number you could not read.
              fill={onHand ? 'var(--color-accent)' : 'var(--color-text)'}
              fontSize={onHand ? 14.5 : 13}
              fontWeight={onHand ? 700 : 500}
            >
              {label.text}
            </text>
          )
        })}

      </svg>

      {/* Six degrees a minute is a fine aim on a phone. These are how you land on 44 without it. */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={mode === 'hour' ? 'An hour earlier' : 'A minute earlier'}
          onClick={() => nudge(-1)}
          className="anim-press inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-hover)]"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        {/*
          * The label is the switch.
          *
          * Tapping either half of the readout already jumps to that half, but only if you know it —
          * nothing about a big number says it is a button. This names what the dial is measuring and
          * swaps it, which is the same job the nudges either side are doing for the value, and it is
          * where your thumb already is.
          */}
        <button
          type="button"
          aria-label={mode === 'hour' ? 'Switch to the minute' : 'Switch to the hour'}
          onClick={() => setMode(mode === 'hour' ? 'minute' : 'hour')}
          className="anim-press inline-flex min-w-[6.5rem] items-center justify-center gap-1.5 rounded-full bg-[var(--color-surface-muted)] px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
        >
          <ArrowLeftRight className="h-3 w-3 shrink-0" aria-hidden />
          {mode === 'hour' ? 'Hour' : 'Minute'}
        </button>
        <button
          type="button"
          aria-label={mode === 'hour' ? 'An hour later' : 'A minute later'}
          onClick={() => nudge(1)}
          className="anim-press inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-hover)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
