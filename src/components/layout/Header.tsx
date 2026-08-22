import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Moon, Star, Sun, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../ui/IconButton'
import { ProjectLogo } from '../brand/ProjectLogo'
import { DevMigrateNotesButton } from '../dev/DevMigrateNotesButton'
import { GlobalSearch } from '../search/GlobalSearch'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useToggleFeedback } from '../../hooks/useToggleFeedback'
import { cn } from '../../lib/cn'

export interface HeaderProps {
  className?: string
}

export function Header({ className }: HeaderProps) {
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const themePopping = useToggleFeedback(theme === 'dark')
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moreOpen) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [moreOpen])

  const handleSignOut = () => {
    void signOut().catch(() => undefined)
  }

  return (
    <header
      className={cn(
        // min-h rather than h: the status-bar inset is added as padding, and a fixed height would
        // squash the row's contents into the strip instead of sitting below it.
        'flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 pb-1.5 sm:min-h-14 sm:gap-4 sm:px-4 sm:pb-0',
        'pt-[env(safe-area-inset-top)]',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        {/* The mark stands in for the name where the name is too wide — on a phone the wordmark
            was competing with the search field, and the mark says the same thing in 20px. */}
        <ProjectLogo className="h-4 w-[22px] text-[var(--color-accent)]" label="Mindstack" />
        <h1
          // Dropped on the narrowest screens: the search bar needs the room far more, and the
          // bottom bar now carries the app's identity/navigation there.
          className="hidden shrink-0 whitespace-nowrap px-0.5 text-base font-semibold tracking-tight text-[var(--color-text)] sm:inline sm:text-lg"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Mindstack
        </h1>
      </div>

      <GlobalSearch className="min-w-0 max-w-xl flex-1" />

      {/* ml-auto because the search bar is capped at max-w-xl: on a wide screen it stops growing
          and the leftover space would otherwise pile up after these controls, leaving them
          stranded mid-header instead of at the right edge. */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <IconButton
          label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? (
            <Sun className={cn('h-5 w-5', themePopping && 'anim-pop')} />
          ) : (
            <Moon className={cn('h-5 w-5', themePopping && 'anim-pop')} />
          )}
        </IconButton>

        {/* Secondary actions stay inline on larger screens; on mobile they collapse into the
            "More" menu below so the app name and search never get squeezed out. */}
        <IconButton label="Important" onClick={() => navigate('/important')} className="hidden sm:inline-flex">
          <Star className="h-5 w-5" />
        </IconButton>
        {import.meta.env.DEV ? (
          <div className="hidden sm:block">
            <DevMigrateNotesButton />
          </div>
        ) : null}
        <IconButton label="Sign out" onClick={handleSignOut} className="hidden sm:inline-flex">
          <LogOut className="h-5 w-5" />
        </IconButton>

        <div ref={moreRef} className="relative sm:hidden">
          <IconButton
            label="More actions"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreHorizontal className="h-5 w-5" />
          </IconButton>
          {moreOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-1 min-w-[10rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-md)]"
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  setMoreOpen(false)
                  navigate('/important')
                }}
              >
                <Star className="h-4 w-4" aria-hidden />
                Important
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  setMoreOpen(false)
                  handleSignOut()
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
