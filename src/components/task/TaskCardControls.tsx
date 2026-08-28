import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from 'react'

export interface TaskCardControlsProps {
  /**
   * The card's foreground colour. Everything here is mixed from it, so the cluster belongs to the
   * card whatever colour the card is — a fixed grey would be invisible on half the palette and
   * heavy-handed on the other half.
   */
  ink: string
  /** The one genuinely one-tap control: the colour on a note, the state on a task. */
  left: ReactNode
  /** Everything else, behind the menu. */
  right: ReactNode
}

/**
 * The two controls in a card's corner.
 *
 * Third attempt, and the previous two were wrong in opposite directions. Two loose round buttons put
 * fourteen pixels of nothing between things that are always used together. Enclosing them in a
 * bordered capsule with a hairline down the middle fixed that and cost more than it bought: an
 * outline, a divider and each button's own shape made four pieces of chrome for two controls, 76px
 * wide on a card that is 150px across on a phone — half the title's row spent on furniture.
 *
 * So: one soft capsule, no outline, no divider. A filled shape with no border reads as a single
 * object at a glance where an outlined one reads as a container with things in it, and dropping both
 * lines takes it from 76px to 48px without moving either control. The two halves are told apart by
 * what they *are* — a colour, and three dots — which was always enough.
 *
 * Clicks stop here. The card behind is itself a button, so a tap landing on the capsule's own
 * padding, which belongs to neither control, used to open the note.
 */
export function TaskCardControls({ ink, left, right }: TaskCardControlsProps) {
  const swallow = (event: MouseEvent | PointerEvent) => {
    event.stopPropagation()
  }

  return (
    <div
      onClick={swallow}
      onPointerDown={swallow}
      className="inline-flex h-6 shrink-0 items-stretch overflow-hidden rounded-full"
      style={
        {
          /*
           * A wash of the ink, and no border.
           *
           * 14% rather than the 10% the outlined version used: with nothing drawing the edge, the
           * fill is the only thing saying where the capsule is, and at 10% it disappeared into a
           * dark card and left two buttons floating again.
           */
          background: `color-mix(in srgb, ${ink} 14%, transparent)`,
          /*
           * What "hover" means inside here.
           *
           * Both halves highlight from --color-hover, which is a theme grey — right everywhere else
           * in the app, and a grey disc appearing inside a green capsule here. Redefining the token
           * for this subtree tints those highlights with the card's own ink instead, without either
           * button knowing anything about it. The same move .space-theme makes for a whole workspace,
           * at the scale of one control.
           */
          '--color-hover': `color-mix(in srgb, ${ink} 16%, transparent)`,
        } as CSSProperties
      }
    >
      {/* Equal, fixed halves. Sized by their contents they came out a pixel apart — a 14px swatch
        * beside a 16px glyph — which is the sort of asymmetry that reads as wrong without being
        * nameable. */}
      <span className="inline-flex w-6 items-center justify-center">{left}</span>
      <span className="inline-flex w-6 items-center justify-center">{right}</span>
    </div>
  )
}
