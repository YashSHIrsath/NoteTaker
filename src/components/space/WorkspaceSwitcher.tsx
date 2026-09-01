import { Fragment, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronsUpDown, House, Users } from 'lucide-react'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import { useSpaces } from '../../hooks/useSpaces'
import { useWorkspace } from '../../hooks/useWorkspace'
import { SpaceAvatar } from './SpaceAvatar'
import { ROLE_LABELS } from '../../lib/spaceRoles'
import { cn } from '../../lib/cn'
import type { SpaceSummary } from '../../types'

const PANEL_WIDTH = 260

export interface WorkspaceSwitcherProps {
  /** The sidebar's narrow mode: the label goes, the control stays. */
  collapsed?: boolean
  /**
   * What to press, when the caller has something better than a name.
   *
   * The header has the app's mark sitting where a workspace switcher belongs, and two marks in the
   * same corner would be one too many. Given this, the switcher wears it — the panel, the anchoring
   * and every rule about when there is nothing to switch to stay exactly the same, because they are
   * the part worth having in one place.
   */
  trigger?: ReactNode
  className?: string
}

/** A space's dot, or the app's own mark for personal notes. */
function WorkspaceDot({ space }: { space?: SpaceSummary }) {
  if (!space) {
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        aria-hidden
      >
        <House className="h-3 w-3" />
      </span>
    )
  }
  return (
    <SpaceAvatar
      spaceId={space.id}
      color={space.color}
      imageUrl={space.imageUrl}
      className="h-5 w-5 rounded-md"
      iconClassName="h-3 w-3"
    />
  )
}

/**
 * Which workspace you are in, and the way out of it.
 *
 * Opening a space replaces the whole app with the same screens pointed at somebody else's content,
 * and until this existed there was nothing on screen that said so and no way back except the browser
 * button. Both halves of that matter: knowing where you are, and being able to leave.
 *
 * Rendered as a plain label rather than a control when there is genuinely nothing to switch to — a
 * dropdown whose only entry is the thing you are already looking at is a worse answer than a word.
 */
export function WorkspaceSwitcher({ collapsed = false, trigger, className }: WorkspaceSwitcherProps) {
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const { owned, joined, getSpace } = useSpaces()
  const panel = useAnchoredPanel<HTMLDivElement>(PANEL_WIDTH)

  const spaces = [...owned, ...joined]
  const current = workspace.kind === 'space' ? getSpace(workspace.id) : undefined
  const label = workspace.kind === 'space' ? current?.name ?? 'Shared space' : 'Mindstack'

  // Personal plus every space. Nothing to open if that is one entry and you are already on it.
  const hasSomewhereElse = spaces.length > 0 || workspace.kind === 'space'

  if (!hasSomewhereElse) {
    if (trigger) {
      return <span className={cn('inline-flex min-w-0 items-center', className)}>{trigger}</span>
    }
    return (
      <span
        className={cn(
          'truncate text-[16px] font-semibold tracking-tight text-[var(--color-text)]',
          className,
        )}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {label}
      </span>
    )
  }

  const go = (path: string) => {
    panel.setOpen(false)
    navigate(path)
  }

  return (
    <Fragment>
      <div ref={panel.anchorRef} className={cn('min-w-0', className)}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={panel.open}
          aria-label={`Workspace: ${label}. Switch workspace`}
          title={collapsed ? label : undefined}
          onClick={() => panel.setOpen((open) => !open)}
          className={cn(
            'anim-press flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors',
            'hover:bg-[var(--color-hover)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
            // A 32px box collapsed, matching the collapse toggle stacked under it: in a 76px rail
            // those two are the whole header, and one at 24px beside one at 32 reads as a mistake
            // rather than as a hierarchy.
            collapsed && 'h-8 w-8 justify-center px-0',
          )}
        >
          {trigger ?? (collapsed ? (
            <WorkspaceDot space={current} />
          ) : (
            <>
              <span
                className="truncate text-[16px] font-semibold tracking-tight text-[var(--color-text)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {label}
              </span>
              <ChevronsUpDown
                className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                aria-hidden
              />
            </>
          ))}
        </button>
      </div>

      {panel.open && panel.position
        ? createPortal(
            <>
              {/* A click anywhere else closes it. Rendered behind the panel rather than as a
                * document listener so a tap on another control still reaches that control. */}
              <button
                type="button"
                aria-label="Close workspace menu"
                className="fixed inset-0 z-[59] cursor-default"
                onClick={() => panel.setOpen(false)}
              />
              <div
                ref={panel.panelRef}
                role="menu"
                aria-label="Switch workspace"
                className="anim-panel-in fixed z-[60] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
                style={{
                  top: panel.position.top,
                  left: panel.position.left,
                  width: PANEL_WIDTH,
                  maxHeight: panel.position.maxHeight,
                  overflowY: 'auto',
                }}
              >
                <p className="px-3 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Your notes
                </p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => go('/')}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-hover)]"
                >
                  <WorkspaceDot />
                  <span className="min-w-0 flex-1 truncate">Mindstack</span>
                  {workspace.kind === 'personal' ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" aria-hidden />
                  ) : null}
                </button>

                {spaces.length > 0 ? (
                  <>
                    <p className="mt-1 border-t border-[var(--color-border)] px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      Shared spaces
                    </p>
                    {spaces.map((space) => {
                      const active = workspace.kind === 'space' && workspace.id === space.id
                      return (
                        <button
                          key={space.id}
                          type="button"
                          role="menuitem"
                          onClick={() => go(`/s/${space.id}`)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[var(--color-text)] transition-colors hover:bg-[var(--color-hover)]"
                        >
                          <WorkspaceDot space={space} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{space.name}</span>
                            <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
                              {ROLE_LABELS[space.role]}
                              {space.memberCount > 1 ? ` · ${space.memberCount} people` : ''}
                            </span>
                          </span>
                          {active ? (
                            <Check
                              className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]"
                              aria-hidden
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </>
                ) : null}

                <div className="mt-1 border-t border-[var(--color-border)] pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => go('/spaces')}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                  >
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
                      aria-hidden
                    >
                      <Users className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">Manage shared spaces</span>
                  </button>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </Fragment>
  )
}
