import { Moon, Star, Sun, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../ui/IconButton'
import { ProjectLogo } from '../brand/ProjectLogo'
import { DevMigrateNotesButton } from '../dev/DevMigrateNotesButton'
import { GlobalSearch } from '../search/GlobalSearch'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useToggleFeedback } from '../../hooks/useToggleFeedback'
import { cn } from '../../lib/cn'
import { originFromElement } from '../../lib/themeReveal'

export interface HeaderProps {
  className?: string
}

export function Header({ className }: HeaderProps) {
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const themePopping = useToggleFeedback(theme === 'dark')

  const handleSignOut = () => {
    void signOut().catch(() => undefined)
  }

  return (
    <header
      className={cn(
        // min-h rather than h: the status-bar inset is added as padding, and a fixed height would
        // squash the row's contents into the strip instead of sitting below it.
        // The horizontal gutter is the pages' own (px-4 sm:px-6): the header sits directly above
        // their content, and any difference shows up as the logo and the cards below starting on
        // two different lines.
        'flex min-h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 pb-1.5 sm:min-h-14 sm:gap-4 sm:px-6 sm:pb-0',
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
          onClick={(event) => toggleTheme(originFromElement(event.currentTarget))}
        >
          {theme === 'dark' ? (
            <Sun className={cn('h-5 w-5', themePopping && 'anim-pop')} />
          ) : (
            <Moon className={cn('h-5 w-5', themePopping && 'anim-pop')} />
          )}
        </IconButton>

        <IconButton label="Important" onClick={() => navigate('/important')} className="hidden lg:inline-flex">
          <Star className="h-5 w-5" />
        </IconButton>
        {import.meta.env.DEV ? (
          <div className="hidden sm:block">
            <DevMigrateNotesButton />
          </div>
        ) : null}

        {/* From lg, sign out lives in the sidebar's account row, beside the face and name it
            signs out of. Below lg there's no sidebar, so it sits here — as the button itself. It
            used to be one item inside a "More" menu, which is a menu's worth of clicks for a
            single action; Important, the only other entry, is already the bottom bar's Starred tab
            at these widths and the sidebar's own row above them. */}
        <IconButton label="Sign out" onClick={handleSignOut} className="lg:hidden">
          <LogOut className="h-5 w-5" />
        </IconButton>
      </div>
    </header>
  )
}
