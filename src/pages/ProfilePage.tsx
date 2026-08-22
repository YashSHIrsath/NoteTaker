import { useRef, useState, type ChangeEvent } from 'react'
import { Briefcase, Camera, ClipboardList, FileText, Folder, LogOut, User as UserIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { useFolders } from '../hooks/useFolders'
import { toAuthErrorMessage } from '../lib/authErrors'
import { cn } from '../lib/cn'
import {
  MAX_TILES_PER_ROW,
  MIN_TILES_PER_ROW,
  readTilesPerRow,
  readViewStyle,
  type TilesPerRow,
  type ViewStyle,
} from '../lib/viewStyle'
import { uploadAvatar } from '../services/profile/avatarUpload'

const VIEW_STYLE_OPTIONS: Array<{ key: ViewStyle; label: string; description: string; icon: typeof Briefcase }> = [
  {
    key: 'professional',
    label: 'Professional',
    description: 'Classic list cards for folders, Tasks and Important.',
    icon: Briefcase,
  },
  {
    key: 'clipboard',
    label: 'Clipboard',
    description: 'Colorful sticky-note tiles for folders, Tasks and Important.',
    icon: ClipboardList,
  },
]

const inputClassName =
  'mt-1.5 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20'

function formatJoinDate(iso: string | undefined): string {
  if (!iso) {
    return 'Unknown'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, signOut, updateProfile } = useAuth()
  const { folders, tasks } = useFolders()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const metadata = (user?.user_metadata ?? {}) as { full_name?: string; avatar_url?: string }
  const [fullName, setFullName] = useState(metadata.full_name ?? '')
  const [avatarUrl, setAvatarUrl] = useState(metadata.avatar_url ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [viewStyleSaving, setViewStyleSaving] = useState(false)
  const [tilesSaving, setTilesSaving] = useState(false)
  const viewStyle = readViewStyle(user?.user_metadata as Record<string, unknown> | undefined)
  const tilesPerRow = readTilesPerRow(user?.user_metadata as Record<string, unknown> | undefined)

  const changeTilesPerRow = async (next: TilesPerRow) => {
    if (next === tilesPerRow) {
      return
    }
    setTilesSaving(true)
    try {
      await updateProfile({ tilesPerRow: next })
    } catch {
      /* the profile card's own error banner covers a failed save */
    } finally {
      setTilesSaving(false)
    }
  }

  if (!user) {
    return null
  }

  const initial = (fullName || user.email || 'Y').charAt(0).toUpperCase()
  const dirty = fullName.trim() !== (metadata.full_name ?? '')

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setError(null)
    setUploading(true)
    try {
      const url = await uploadAvatar(user.id, file)
      await updateProfile({ avatarUrl: url })
      setAvatarUrl(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : toAuthErrorMessage(cause))
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      await updateProfile({ fullName: fullName.trim() })
      setSaved(true)
    } catch (cause) {
      setError(toAuthErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const handleViewStyleChange = async (next: ViewStyle) => {
    if (next === viewStyle) {
      return
    }
    setViewStyleSaving(true)
    try {
      await updateProfile({ viewStyle: next })
    } catch (cause) {
      setError(toAuthErrorMessage(cause))
    } finally {
      setViewStyleSaving(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div
      // pb-28 below lg leaves room for the floating bottom bar: without it the last card — and the
      // sign-out button on it — sat under the bar with nothing left to scroll.
      className="h-full overflow-y-auto bg-[var(--color-surface-muted)] px-4 pb-28 pt-5 sm:px-6 lg:pb-5"
    >
      {/* One centred column instead of cards hugging the left edge of a wide window. */}
      <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] sm:h-9 sm:w-9">
          <UserIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
        </span>
        <h1
          className="text-[18px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[22px]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Profile
        </h1>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <span
                className="inline-flex h-20 w-20 items-center justify-center rounded-full text-[28px] font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))',
                  fontFamily: 'var(--font-display)',
                }}
                aria-hidden
              >
                {initial}
              </span>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change photo"
              className="absolute -right-1 -bottom-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] shadow-[var(--shadow-sm)] hover:text-[var(--color-text)] disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => void handleFileChange(event)}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-[var(--color-text)]">
              {fullName.trim() || 'Add your name'}
            </p>
            <p className="truncate text-sm text-[var(--color-text-muted)]">{user.email}</p>
            {uploading ? (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Uploading photo…</p>
            ) : null}
          </div>
        </div>

        <label className="mt-5 block text-sm text-[var(--color-text-muted)]">
          Display name
          <input
            className={inputClassName}
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value)
              setSaved(false)
            }}
            placeholder="Your name"
          />
        </label>

        <label className="mt-3 block text-sm text-[var(--color-text-muted)]">
          Email
          <input
            className={cn(inputClassName, 'text-[var(--color-text-muted)]')}
            value={user.email ?? ''}
            readOnly
          />
        </label>

        {error ? <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p> : null}

        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {saved && !dirty ? (
            <span className="text-sm text-[var(--color-text-muted)]">Saved</span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Notes style
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {VIEW_STYLE_OPTIONS.map((option) => {
            const Icon = option.icon
            const active = viewStyle === option.key
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                disabled={viewStyleSaving}
                onClick={() => void handleViewStyleChange(option.key)}
                className={cn(
                  'flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-colors disabled:opacity-60',
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-hover)]',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    active
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-hover)] text-[var(--color-text-muted)]',
                  )}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-[var(--color-text)]">
                    {option.label}
                  </span>
                  <span className="block text-[12px] text-[var(--color-text-muted)]">
                    {option.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Tiles per row
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
          How many note tiles sit side by side on Tasks, Important and the folder views. Auto fits
          as many as the screen can actually carry — a fixed number is kept at every size, so high
          counts get cramped on a phone.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={tilesPerRow === 'auto'}
            disabled={tilesSaving}
            onClick={() => void changeTilesPerRow('auto')}
            className={cn(
              'anim-press rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60',
              tilesPerRow === 'auto'
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
            )}
          >
            Auto
          </button>
          {Array.from({ length: MAX_TILES_PER_ROW - MIN_TILES_PER_ROW + 1 }, (_, index) => index + MIN_TILES_PER_ROW).map(
            (count) => {
              const active = tilesPerRow === count
              return (
                <button
                  key={count}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${count} per row`}
                  disabled={tilesSaving}
                  onClick={() => void changeTilesPerRow(count)}
                  className={cn(
                    'anim-press h-9 w-9 rounded-full border text-[13px] font-semibold transition-colors disabled:opacity-60',
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                  )}
                >
                  {count}
                </button>
              )
            },
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Account
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--color-text-muted)]">Workspace</dt>
            <dd className="text-[var(--color-text)]">Personal workspace</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--color-text-muted)]">Member since</dt>
            <dd className="text-[var(--color-text)]">{formatJoinDate(user.created_at)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <Folder className="h-3.5 w-3.5" aria-hidden />
              Folders
            </dt>
            <dd className="text-[var(--color-text)]">{folders.length}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Tasks
            </dt>
            <dd className="text-[var(--color-text)]">{tasks.length}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        <Button variant="danger" onClick={() => void handleSignOut()}>
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </Button>
      </div>
      </div>
    </div>
  )
}
