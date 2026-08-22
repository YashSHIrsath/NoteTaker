import { ClipboardList, Folder, ListTree, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SidebarNavId } from '../../types'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/cn'

type BottomNavId = SidebarNavId | 'profile'

interface BottomNavItem {
  id: BottomNavId
  label: string
  icon: ReactNode
}

const ITEMS: BottomNavItem[] = [
  { id: 'tree', label: 'Tree', icon: <ListTree className="h-[18px] w-[18px]" aria-hidden /> },
  { id: 'mynotes', label: 'Notes', icon: <Folder className="h-[18px] w-[18px]" aria-hidden /> },
  { id: 'tasks', label: 'Tasks', icon: <ClipboardList className="h-[18px] w-[18px]" aria-hidden /> },
  { id: 'important', label: 'Starred', icon: <Star className="h-[18px] w-[18px]" aria-hidden /> },
  // profile's icon is the account's own avatar, filled in below
  { id: 'profile', label: 'You', icon: null },
]

export interface BottomNavProps {
  activeNav?: SidebarNavId
  profileActive?: boolean
  onSelectNav: (id: SidebarNavId) => void
  onOpenProfile: () => void
}

/**
 * Primary navigation below `lg`, where there's no room for a sidebar: a floating glass bar.
 *
 * The active indicator is one absolutely-positioned pill translated across the bar rather than a
 * background on each button — with five equal-width items, `translateX(index * 100%)` is exact,
 * and one moving element is what makes switching read as a slide instead of a swap.
 */
export function BottomNav({ activeNav, profileActive = false, onSelectNav, onOpenProfile }: BottomNavProps) {
  const { user } = useAuth()
  const metadata = (user?.user_metadata ?? {}) as { full_name?: string; avatar_url?: string }
  const initial = (metadata.full_name?.trim() || user?.email || 'Y').charAt(0).toUpperCase()

  const activeId: BottomNavId | undefined = profileActive ? 'profile' : activeNav
  const activeIndex = ITEMS.findIndex((item) => item.id === activeId)

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center lg:hidden',
        // Clear of the iOS home indicator / Android gesture bar.
        'px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
      )}
    >
      <div
        className={cn(
          'pointer-events-auto relative flex w-full max-w-md items-center rounded-full p-1',
          // Glass: a translucent tint of the app's own surface over a blur, so it picks up
          // whatever scrolls underneath and stays legible in either theme.
          'border border-[var(--color-border)]/70 bg-[var(--color-surface)]/70 backdrop-blur-xl',
          'shadow-[var(--shadow-lg)]',
          'supports-[backdrop-filter:blur(0px)]:bg-[var(--color-surface)]/60',
        )}
      >
        {activeIndex >= 0 ? (
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)] rounded-full',
              'bg-[var(--color-accent-soft)] ring-1 ring-inset ring-[var(--color-accent)]/25',
              'transition-transform duration-300 [transition-timing-function:var(--motion-ease)]',
              'motion-reduce:transition-none',
            )}
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
        ) : null}

        {ITEMS.map((item) => {
          const active = activeId === item.id
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => (item.id === 'profile' ? onOpenProfile() : onSelectNav(item.id as SidebarNavId))}
              className={cn(
                'anim-press relative z-10 flex flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-1.5',
                'text-[10px] font-semibold transition-colors',
                active ? 'text-[var(--color-accent-ink)]' : 'text-[var(--color-text-muted)]',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center transition-transform duration-200',
                  '[transition-timing-function:var(--motion-spring)] motion-reduce:transition-none',
                  active ? 'scale-110' : 'scale-100',
                )}
              >
                {item.id === 'profile' ? (
                  metadata.avatar_url ? (
                    <img
                      src={metadata.avatar_url}
                      alt=""
                      className={cn(
                        'h-6 w-6 rounded-full object-cover',
                        active ? 'ring-2 ring-[var(--color-accent)]' : 'ring-1 ring-[var(--color-border)]',
                      )}
                    />
                  ) : (
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))' }}
                      aria-hidden
                    >
                      {initial}
                    </span>
                  )
                ) : (
                  item.icon
                )}
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
