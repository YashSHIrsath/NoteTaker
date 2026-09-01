import { Check, Move } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'

export interface ArrangeToggleProps {
  arranging: boolean
  onToggle: () => void
  /**
   * 'md' (the default) is the height every other control in these header rows uses. 'fill' takes
   * the height from whatever wraps it, for the Starred page, where this sits inside a pill sized
   * for the bar rather than for a button — the same escape hatch, and the same name, as
   * TaskFilterMenu's.
   */
  size?: 'md' | 'fill'
  className?: string
}

/**
 * The switch that lets a listing's cards be moved and resized — see TaskGridCanvas's `arranging`.
 *
 * One control shared by the three listings that draw the canvas, so the way you get into and out
 * of the mode is the same wherever you meet it, and so is the vocabulary: Edit, then Done.
 *
 * Icon-only below `sm`, in both states. The rows this sits in are already carrying New Task, the
 * filters and — in a folder — New Folder and the view switch, and on a 360px phone the four
 * characters of "Done" are enough to push New Task into wrapping and grow the header by a line.
 * What says the mode is on there is the button itself: it is the one accent-filled control in the
 * header, it holds a tick rather than the move arrows, and behind it every card has picked up a
 * dashed edge and a grip. Pressing it again is the way out, which is where the finger already is.
 */
export function ArrangeToggle({ arranging, onToggle, size = 'md', className }: ArrangeToggleProps) {
  return (
    <Button
      variant={arranging ? 'primary' : 'subtle'}
      size="sm"
      aria-pressed={arranging}
      aria-label={arranging ? 'Finish arranging cards' : 'Arrange cards'}
      title={
        arranging
          ? 'Finish arranging'
          : 'Arrange cards — drag them by the grip, resize from the corner'
      }
      onClick={onToggle}
      className={cn('shrink-0', size === 'fill' ? 'h-full' : 'h-8 sm:h-9', className)}
    >
      {arranging ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Move className="h-4 w-4" aria-hidden />
      )}
      <span className="hidden sm:inline">{arranging ? 'Done' : 'Edit'}</span>
    </Button>
  )
}
