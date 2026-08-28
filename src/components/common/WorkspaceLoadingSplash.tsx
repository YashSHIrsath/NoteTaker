import { LoadingSplash } from './LoadingSplash'
import { SpaceAvatar } from '../space/SpaceAvatar'
import { useSpaces } from '../../hooks/useSpaces'
import { useWorkspace } from '../../hooks/useWorkspace'
import { spaceColorFor } from '../../lib/spaceColor'

export interface WorkspaceLoadingSplashProps {
  /** What is being waited on, for your own notes. A space says its own name instead. */
  label: string
}

/**
 * The wait while a workspace loads — the app's mark for your own notes, the space's for a space.
 *
 * Walking into somebody else's workspace is the one navigation in this app with a cost attached to
 * not noticing it, and the loading screen is the first full second of it. Showing the Mindstack
 * loader and "Opening your notes" during that second said the opposite of what was happening, and
 * then the tinted app arrived with no explanation of the change.
 *
 * So a space announces itself: its picture, its name, and its colour radiating out of the mark. The
 * halo is two rings half a period apart, which reads as continuous radiating rather than a flash —
 * the same treatment the overdue markers use, in the space's colour rather than an urgency's.
 */
export function WorkspaceLoadingSplash({ label }: WorkspaceLoadingSplashProps) {
  const workspace = useWorkspace()
  const { getSpace } = useSpaces()
  const space = workspace.kind === 'space' ? getSpace(workspace.id) : undefined

  // Until the space list arrives there is no name and no colour to show, and a splash that filled
  // itself in halfway through would be worse than the plain one. This resolves in the same moment
  // the notes do, so in practice it is the plain splash for a blink or the space's for the whole
  // wait, never a swap between them.
  if (!space) {
    return <LoadingSplash label={label} />
  }

  const tint = `var(--task-${spaceColorFor(space.id, space.color)}-solid)`

  return (
    <div className="anim-delayed-in flex h-full flex-col items-center justify-center gap-5 bg-[var(--color-surface)] px-6 text-center">
      <span className="relative inline-flex items-center justify-center">
        {/* Two rings, half a period apart. Borders rather than fills, so they expand past the
          * mark without ever covering it. */}
        <span
          aria-hidden
          className="anim-space-halo absolute h-16 w-16 rounded-full border-2"
          style={{ borderColor: tint }}
        />
        <span
          aria-hidden
          className="anim-space-halo absolute h-16 w-16 rounded-full border-2"
          style={{ borderColor: tint, animationDelay: '950ms' }}
        />
        <SpaceAvatar
          spaceId={space.id}
          color={space.color}
          imageUrl={space.imageUrl}
          className="anim-space-mark relative h-16 w-16 rounded-2xl"
          iconClassName="h-7 w-7"
        />
      </span>

      <div className="anim-rise flex flex-col gap-1" style={{ animationDelay: '120ms' }}>
        <p
          className="text-[17px] font-semibold tracking-tight text-[var(--color-text)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {space.name}
        </p>
        <p className="text-[12.5px] font-medium tracking-wide text-[var(--color-text-muted)]">
          Opening this space
        </p>
      </div>
    </div>
  )
}
