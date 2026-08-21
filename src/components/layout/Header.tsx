import { Menu, Star, X, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../ui/IconButton'
import { DevMigrateNotesButton } from '../dev/DevMigrateNotesButton'
import { GlobalSearch } from '../search/GlobalSearch'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/cn'

export interface HeaderProps {
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  className?: string
}

export function Header({ sidebarOpen, onToggleSidebar, className }: HeaderProps) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 sm:px-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onToggleSidebar && (
          <IconButton
            label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            onClick={onToggleSidebar}
            className="md:hidden"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </IconButton>
        )}
        <h1 className="min-w-0 max-w-[28%] truncate px-1 text-lg font-semibold tracking-tight text-[var(--color-text)] sm:max-w-none">
          MyNotes
        </h1>
        <GlobalSearch className="max-w-xl" />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton label="Important" onClick={() => navigate('/important')}>
          <Star className="h-5 w-5" />
        </IconButton>
        {import.meta.env.DEV ? <DevMigrateNotesButton /> : null}
        <IconButton
          label="Sign out"
          onClick={() => {
            void signOut().catch(() => undefined)
          }}
        >
          <LogOut className="h-5 w-5" />
        </IconButton>
      </div>
    </header>
  )
}
