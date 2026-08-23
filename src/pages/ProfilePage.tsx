import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  Briefcase,
  CalendarDays,
  Camera,
  Check,
  ClipboardList,
  FileText,
  Folder,
  LayoutGrid,
  LogOut,
  Sparkles,
  User as UserIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useCountUp } from '../hooks/useCountUp'
import { useFolders } from '../hooks/useFolders'
import { useMaxTilesPerRow } from '../hooks/useTileGrid'
import { toAuthErrorMessage } from '../lib/authErrors'
import { cn } from '../lib/cn'
import {
  MIN_TILES_PER_ROW,
  readTilesPerRow,
  readViewStyle,
  type TilesPerRow,
  type ViewStyle,
} from '../lib/viewStyle'
import { uploadAvatar } from '../services/profile/avatarUpload'

const VIEW_STYLE_OPTIONS: Array<{
  key: ViewStyle
  label: string
  description: string
  icon: typeof Briefcase
}> = [
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

const inputClassName = [
  'mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5',
  'text-sm text-[var(--color-text)] outline-none transition-colors',
  // No hover state: the border lighting up under the pointer suggested the field does something
  // on click that it doesn't, and on a touch screen there's no hover to explain it at all. Focus
  // is the state that matters here, and it's the one that's styled.
  'focus:border-[var(--color-accent)] focus:ring-4 focus:ring-[var(--color-accent)]/15',
].join(' ')

/* The label sits over the field's *text*, not the field's box: the input pads its content in by
   px-4, so a flush-left label started 17px to the left of the value under it — close enough to
   read as a mistake rather than as a deliberate outdent. */
const fieldLabelClassName = 'block pl-4 text-[13px] font-medium text-[var(--color-text-muted)]'

/** The colours the stat chips and section headers cycle through, in order. */
const ACCENTS = ['indigo', 'teal', 'amber', 'rose'] as const

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

/**
 * A settings card. `order` drives the entrance stagger — the cards rise in sequence rather than
 * all at once, which is what turns a flat column of boxes into something with a reading order.
 */
function Card({
  order,
  className,
  children,
}: {
  order: number
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'anim-rise rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5',
        'shadow-[var(--shadow-sm)]',
        className,
      )}
      style={{ animationDelay: `${order * 70}ms` }}
    >
      {children}
    </section>
  )
}

/** Section heading with a tinted glyph, so the cards are told apart by colour before they're read. */
function CardTitle({
  icon,
  category,
  children,
}: {
  icon: ReactNode
  category: (typeof ACCENTS)[number]
  children: ReactNode
}) {
  return (
    <h2 className="flex items-center gap-2.5">
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `var(--cat-${category}-soft)`, color: `var(--cat-${category})` }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="text-[13px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {children}
      </span>
    </h2>
  )
}

/** One number from the workspace, counting up on arrival. */
function StatChip({
  icon,
  label,
  value,
  category,
  order,
}: {
  icon: ReactNode
  label: string
  value: number | string
  category: (typeof ACCENTS)[number]
  order: number
}) {
  const numeric = typeof value === 'number'
  const counted = useCountUp(numeric ? value : 0)

  return (
    <div
      className={cn(
        'anim-rise flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3 py-2.5',
        'border border-[var(--color-border)] bg-[var(--color-surface)]/70 backdrop-blur-sm',
      )}
      style={{ animationDelay: `${140 + order * 70}ms` }}
    >
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `var(--cat-${category}-soft)`, color: `var(--cat-${category})` }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className="block truncate text-[17px] font-semibold leading-tight text-[var(--color-text)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {numeric ? counted : value}
        </span>
        <span className="block truncate text-[11.5px] text-[var(--color-text-muted)]">{label}</span>
      </span>
    </div>
  )
}

/**
 * A miniature of what each notes style actually looks like. The old options said "Classic list
 * cards" and "Colorful sticky-note tiles" and left you to imagine the difference; showing three
 * stacked rows against a grid of coloured squares answers it without being read.
 */
function StylePreview({ style, active }: { style: ViewStyle; active: boolean }) {
  const tint = active ? 'var(--color-accent)' : 'var(--color-border-strong)'

  if (style === 'professional') {
    return (
      <span className="flex w-14 shrink-0 flex-col gap-1" aria-hidden>
        {[1, 0.8, 0.6].map((width, index) => (
          <span
            key={index}
            className="h-2 rounded-full transition-colors"
            style={{ width: `${width * 100}%`, background: tint, opacity: active ? 1 : 0.55 }}
          />
        ))}
      </span>
    )
  }

  return (
    <span className="grid w-14 shrink-0 grid-cols-2 gap-1" aria-hidden>
      {(['rose', 'teal', 'amber', 'indigo'] as const).map((category) => (
        <span
          key={category}
          className="h-3.5 rounded-md transition-opacity"
          style={{ background: `var(--cat-${category}-card)`, opacity: active ? 1 : 0.45 }}
        />
      ))}
    </span>
  )
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
  const maxTilesPerRow = useMaxTilesPerRow()

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
  // Auto shows what auto is currently doing, rather than nothing.
  const previewTiles = tilesPerRow === 'auto' ? maxTilesPerRow : Math.min(tilesPerRow, maxTilesPerRow)

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
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {/* ---------------------------------------------------------------- hero

            The page used to open with a small "Profile" heading and then repeat the name and email
            in the card below it. This is one card instead: who you are, and what you've built,
            over a wash of the brand colour. The workspace numbers were buried in an "Account"
            table at the very bottom — they're the most rewarding thing on the page, so they lead. */}
        <section className="anim-rise relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
          {/* Two offset blooms rather than a flat gradient fill: they read as light falling across
              the card, and being absolutely positioned they cost nothing on the content below. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-70"
            style={{
              background:
                'radial-gradient(circle at 30% 30%, var(--color-accent-soft), transparent 70%)',
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full opacity-50"
            style={{
              background: 'radial-gradient(circle at 60% 40%, var(--cat-rose-soft), transparent 70%)',
            }}
          />

          <div className="relative flex items-center gap-4">
            <div className="group relative shrink-0">
              {/* The ring is a sibling, not a border: a border would change the avatar's box and
                  nudge the row every time it thickened on hover. */}
              <span
                aria-hidden
                className="absolute -inset-1 rounded-full opacity-70 blur-[2px] transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: 'linear-gradient(135deg, var(--cat-rose), var(--color-accent))',
                }}
              />
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="relative h-20 w-20 rounded-full object-cover transition-transform duration-300 [transition-timing-function:var(--motion-spring)] group-hover:scale-[1.04] motion-reduce:transition-none sm:h-24 sm:w-24"
                />
              ) : (
                <span
                  className="relative inline-flex h-20 w-20 items-center justify-center rounded-full text-[28px] font-bold text-white transition-transform duration-300 [transition-timing-function:var(--motion-spring)] group-hover:scale-[1.04] motion-reduce:transition-none sm:h-24 sm:w-24 sm:text-[32px]"
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
                className={cn(
                  'anim-press absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full',
                  'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]',
                  'shadow-[var(--shadow-md)] transition-colors disabled:opacity-60',
                  'hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
                )}
              >
                {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Camera className="h-4 w-4" aria-hidden />}
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
              <h1
                className="truncate text-[20px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[26px]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {fullName.trim() || 'Add your name'}
              </h1>
              <p className="truncate text-[13px] text-[var(--color-text-muted)] sm:text-sm">
                {user.email}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--color-accent)]">
                <Sparkles className="h-3 w-3" aria-hidden />
                Personal workspace
              </p>
            </div>
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2">
            <StatChip
              icon={<Folder className="h-4 w-4" aria-hidden />}
              label="Folders"
              value={folders.length}
              category="indigo"
              order={0}
            />
            <StatChip
              icon={<FileText className="h-4 w-4" aria-hidden />}
              label="Notes"
              value={tasks.length}
              category="teal"
              order={1}
            />
            <StatChip
              icon={<CalendarDays className="h-4 w-4" aria-hidden />}
              label="Member since"
              value={formatJoinDate(user.created_at)}
              category="amber"
              order={2}
            />
          </div>
        </section>

        {/* ------------------------------------------------------------- details */}
        <Card order={1}>
          <CardTitle icon={<UserIcon className="h-3.5 w-3.5" aria-hidden />} category="rose">
            Your details
          </CardTitle>

          <label className="mt-4 block">
            <span className={fieldLabelClassName}>Display name</span>
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

          <label className="mt-3 block">
            <span className={fieldLabelClassName}>Email</span>
            <input
              className={cn(inputClassName, 'cursor-not-allowed text-[var(--color-text-muted)]')}
              value={user.email ?? ''}
              readOnly
            />
          </label>

          {error ? (
            <p className="anim-item-in mt-3 rounded-xl bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !dirty}>
              {saving ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
            {saved && !dirty ? (
              // anim-pop on the tick: the one moment on this page where something you did
              // succeeded, and it's worth a beat of acknowledgement.
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--cat-emerald)]">
                <Check className="anim-pop h-4 w-4" aria-hidden />
                Saved
              </span>
            ) : null}
          </div>
        </Card>

        {/* --------------------------------------------------------- notes style */}
        <Card order={2}>
          <CardTitle icon={<ClipboardList className="h-3.5 w-3.5" aria-hidden />} category="indigo">
            Notes style
          </CardTitle>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
                    'group relative flex flex-col gap-3 rounded-2xl border p-3.5 text-left transition-all duration-200',
                    'disabled:opacity-60 motion-reduce:transition-none',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25',
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[var(--shadow-md)]'
                      : 'border-[var(--color-border)] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-hover)] hover:shadow-[var(--shadow-md)]',
                  )}
                >
                  {active ? (
                    <span
                      className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-white"
                      aria-hidden
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}

                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                        active
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-hover)] text-[var(--color-text-muted)]',
                      )}
                      aria-hidden
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <StylePreview style={option.key} active={active} />
                  </span>

                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-[var(--color-text)]">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                      {option.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </Card>

        {/* -------------------------------------------------------- tiles per row */}
        <Card order={3}>
          <CardTitle icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden />} category="teal">
            Tiles per row
          </CardTitle>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
            How many note tiles sit side by side on Tasks, Important and the folder views. Auto fits
            as many as the screen can actually carry. The counts offered are the ones this screen can
            hold and still leave a tile readable — a wider display offers more.
          </p>

          {/* A live miniature of the choice. The pills are abstract on their own — a number tells
              you nothing about how the grid will feel — and this costs one row to answer it. */}
          <div
            className="mt-3.5 flex gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5"
            aria-hidden
          >
            {Array.from({ length: previewTiles }, (_, index) => (
              <span
                key={index}
                className="anim-item-in h-9 flex-1 rounded-lg"
                style={{
                  background: `var(--cat-${ACCENTS[index % ACCENTS.length]}-card)`,
                  animationDelay: `${index * 35}ms`,
                }}
              />
            ))}
          </div>

          <div className="mt-3.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={tilesPerRow === 'auto'}
              disabled={tilesSaving}
              onClick={() => void changeTilesPerRow('auto')}
              className={cn(
                'anim-press rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-60',
                tilesPerRow === 'auto'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
              )}
            >
              Auto
            </button>
            {Array.from(
              { length: maxTilesPerRow - MIN_TILES_PER_ROW + 1 },
              (_, index) => index + MIN_TILES_PER_ROW,
            ).map((count) => {
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
                    'anim-press h-10 w-10 rounded-full border text-[13px] font-semibold transition-colors disabled:opacity-60',
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
                  )}
                >
                  {count}
                </button>
              )
            })}
          </div>

          {typeof tilesPerRow === 'number' && tilesPerRow > maxTilesPerRow ? (
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
              Your saved {tilesPerRow} per row needs a wider screen, so this one is showing{' '}
              {maxTilesPerRow}. The choice is kept — it comes back on a display that can hold it.
            </p>
          ) : null}
        </Card>

        {/* ------------------------------------------------------------- sign out

            On its own card rather than a loose red slab under the stack: it's the one destructive
            thing here, and an outline that fills on hover states that without shouting it at you
            every time the page opens. */}
        <Card order={4} className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--color-text-muted)]">
            Signed in as <span className="font-medium text-[var(--color-text)]">{user.email}</span>
          </span>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className={cn(
              'anim-press inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              'border-[var(--color-danger)]/40 text-[var(--color-danger)]',
              'hover:border-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)]/25',
            )}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </Card>
      </div>
    </div>
  )
}
