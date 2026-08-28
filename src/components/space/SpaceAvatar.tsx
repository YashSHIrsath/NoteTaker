import { Users } from 'lucide-react'
import { spaceColorFor, spaceSwatch } from '../../lib/spaceColor'
import { cn } from '../../lib/cn'
import type { TaskPaletteColor } from '../../types'

export interface SpaceAvatarProps {
  spaceId: string
  color: TaskPaletteColor | null
  imageUrl: string | null
  name?: string
  /** Tailwind size classes for the box — the caller decides how big, this decides what's in it. */
  className?: string
  /** Icon size, when there is no picture. */
  iconClassName?: string
}

/**
 * A space's face: its picture, or its colour.
 *
 * One component because the fallback has to be identical everywhere. A space is recognised by this
 * mark in the sidebar, the footer, the switcher and the spaces list, and a picture that appeared in
 * three of those and a coloured square in the fourth would undo the point of having one.
 *
 * The colour is not a placeholder waiting to be replaced — most spaces will never have a picture, and
 * a stable colour derived from the id is a real identity on its own.
 */
export function SpaceAvatar({
  spaceId,
  color,
  imageUrl,
  name,
  className,
  iconClassName,
}: SpaceAvatarProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        title={name}
        className={cn('shrink-0 rounded-lg object-cover', className)}
      />
    )
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-lg text-white', className)}
      style={{ background: spaceSwatch(spaceColorFor(spaceId, color)) }}
      title={name}
      aria-hidden
    >
      <Users className={cn('h-3.5 w-3.5', iconClassName)} />
    </span>
  )
}
