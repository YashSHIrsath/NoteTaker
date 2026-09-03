import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  ALargeSmall,
  Briefcase,
  CalendarDays,
  Camera,
  Check,
  ClipboardList,
  Compass,
  LayoutGrid,
  FileText,
  Folder,
  History,
  Home,
  LogOut,
  Monitor,
  Palette,
  Sparkles,
  Type,
  User as UserIcon,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from '../hooks/useAuth'
import { useCountUp } from '../hooks/useCountUp'
import { useFolders } from '../hooks/useFolders'
import { useTileBand } from '../hooks/useTileGrid'
import { toAuthErrorMessage } from '../lib/authErrors'
import { cn } from '../lib/cn'
import {
  MIN_TILES_PER_ROW,
  readTilesPerRow,
  type TilesPerRow,
  type ViewStyle,
} from '../lib/viewStyle'
import {
  useDisplaySettings,
  useDisplaySettingsWriter,
} from '../hooks/useDisplaySettings'
import { Notice } from '../components/ui/Notice'
import { FontSettings } from '../components/settings/FontSettings'
import { TypeAdjustmentSettings } from '../components/settings/TypeAdjustmentSettings'
import { ThemeSettings } from '../components/settings/ThemeSettings'
import { NavigationSettings } from '../components/settings/NavigationSettings'
import { SpaceAvatar } from '../components/space/SpaceAvatar'
import { SpaceSettingsPanel } from '../components/space/SpaceSettingsPanel'
import { Masonry } from '../components/ui/Masonry'
import { InviteMemberDialog } from '../components/space/InviteMemberDialog'
import { useSpaces } from '../hooks/useSpaces'
import { useWorkspace } from '../hooks/useWorkspace'
import { ROLE_LABELS, roleCanManageMembers } from '../lib/spaceRoles'
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

/** "Oct 12, 2025". The long month spelled the date out to twenty characters, which is what
 *  pushed the third chip past its share of the row. */
function formatJoinDate(iso: string | undefined): string {
  if (!iso) {
    return 'Unknown'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
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
  className,
}: {
  icon: ReactNode
  label: string
  value: number | string
  category: (typeof ACCENTS)[number]
  order: number
  className?: string
}) {
  const numeric = typeof value === 'number'
  const counted = useCountUp(numeric ? value : 0)

  return (
    <div
      className={cn(
        'anim-rise flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5',
        'border border-[var(--color-border)] bg-[var(--color-surface)]/70 backdrop-blur-sm',
        className,
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
  // The space you are in, if you are in one. On a wide screen the sidebar footer carries this; below
  // `lg` there is no sidebar, so without it a phone had no way to reach a space's picture, its note,
  // or the people in it — and no way to tell it was in one at all.
  const workspace = useWorkspace()
  const { getSpace, invite, refresh: refreshSpaces } = useSpaces()
  const currentSpace = workspace.kind === 'space' ? getSpace(workspace.id) : undefined
  const [spaceInviteOpen, setSpaceInviteOpen] = useState(false)
  // The cards below stagger in. Inserting one has to push the rest along, or two of them arrive
  // together and the cascade stops reading as an order. A space adds its own card, and an admin
  // adds the history card behind it.
  const spaceCards = currentSpace ? (roleCanManageMembers(currentSpace.role) ? 2 : 1) : 0
  const cardOrder = (base: number) => base + spaceCards
  // Space-first: inside a shared space the note style belongs to the space, and this writes it there
  // for everybody. Tiles per row below stays personal — it is a function of the screen in front of
  // you, which is why it is already stored per screen size.
  const { viewStyle } = useDisplaySettings()
  const display = useDisplaySettingsWriter()
  // Everything on this card is about the screen you are reading it on. The band decides both
  // which stored choice is shown and which one a press writes, so opening this page on a phone
  // and on a desktop configures two different things — which is the point.
  const tileBand = useTileBand()
  const maxTilesPerRow = tileBand.max
  const tilesPerRow = readTilesPerRow(
    user?.user_metadata as Record<string, unknown> | undefined,
    tileBand.id,
  )
  const effectivePerRow = tilesPerRow === 'auto' ? maxTilesPerRow : Math.min(tilesPerRow, maxTilesPerRow)

  const changeTilesPerRow = async (next: TilesPerRow) => {
    if (next === tilesPerRow) {
      return
    }
    setTilesSaving(true)
    try {
      await updateProfile({ tilesPerRow: next, tilesPerRowBand: tileBand.id })
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
      await display.save({ viewStyle: next })
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
      {/*
        * One column on a phone; a collage on a wide screen.
        *
        * This page was a 2xl column at every width, which on a desktop meant two thirds of the
        * window was empty and the settings — eight cards, none of them tall — were a scroll several
        * screens long past a lot of nothing. The cards are unrelated to each other and vary in
        * height, which is exactly what CSS columns are for: they fill top-to-bottom and the short
        * ones close up behind the tall ones, so there is no dead space to leave.
        *
        * CSS columns were tried first and could not be relied on. Balancing gives up in the face of
        * a tall card that must not be split: it moves the whole thing to the next column, and with
        * the theme picker in here that left column one ending half a screen early and everything
        * else stacked down the right — the same empty half a window, just on the other side.
        *
        * A grid cannot do that. Every card gets a cell, `items-start` keeps each one its own height
        * rather than stretching it to its neighbour, and the distribution is even by construction
        * because it is counted rather than balanced.
        */}
      <div className="mx-auto w-full max-w-2xl space-y-4 lg:max-w-[74rem]">
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

          {/* Stacked on a phone, side by side from `lg`. The identity is three short lines and the
            * numbers are three chips: on a wide screen putting one under the other left a band of
            * empty card between them and pushed everything below it a screenful down. */}
          <div className="relative lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="relative flex min-w-0 items-center gap-4">
            {/*
              * Inside a space this whole row is the space, not you.
              *
              * Below `lg` this page is the last tab in the bar and the only screen a space has, so
              * it opens with what the sidebar footer shows on a wide one. Your own face and name
              * here read as though the space were yours; they are one tap away, past Return home.
              */}
            {currentSpace ? (
              <>
                <SpaceAvatar
                  spaceId={currentSpace.id}
                  color={currentSpace.color}
                  imageUrl={currentSpace.imageUrl}
                  className="h-20 w-20 shrink-0 rounded-full sm:h-24 sm:w-24"
                  iconClassName="h-8 w-8"
                />
                <div className="min-w-0">
                  <h1
                    className="truncate text-[20px] font-semibold tracking-tight text-[var(--color-text)] sm:text-[26px]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {currentSpace.name}
                  </h1>
                  <p className="truncate text-[13px] text-[var(--color-text-muted)] sm:text-sm">
                    Shared space
                  </p>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--color-accent)]">
                    <Sparkles className="h-3 w-3" aria-hidden />
                    You're {ROLE_LABELS[currentSpace.role].toLowerCase() === 'owner' ? 'the owner' : `an ${ROLE_LABELS[currentSpace.role].toLowerCase()}`}
                  </p>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* A grid, not a wrapping row of flex-1 boxes. Three equal shares of a phone's width is
              about a hundred pixels each, which is why every one of these read "Fol…", "Not…",
              "Me…". The two counts are short enough to sit side by side; the join date is a whole
              sentence of a value, so below sm it takes the row to itself. */}
          <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:mt-0 lg:w-[26rem] lg:shrink-0">
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
            {/* The counts above are already the workspace's — useFolders is scoped to it — so in a
              * space they describe the space. Only the date has to change: what you want to know
              * about a shared workspace is how many people are in it. */}
            {currentSpace ? (
              <StatChip
                icon={<Users className="h-4 w-4" aria-hidden />}
                label="People"
                value={currentSpace.memberCount}
                category="amber"
                order={2}
                className="col-span-2 sm:col-span-1"
              />
            ) : (
              <StatChip
                icon={<CalendarDays className="h-4 w-4" aria-hidden />}
                label="Member since"
                value={formatJoinDate(user.created_at)}
                category="amber"
                order={2}
                className="col-span-2 sm:col-span-1"
              />
            )}
          </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- this space
          *
          * Not a summary with a button that opens a popup — the space itself, on the page.
          *
          * Below `lg` this tab *is* the space's screen, and putting its identity, its note and its
          * people behind a dialog meant the one screen a space had was a card saying it existed.
          * SpaceSettingsPanel is the same component the sidebar's dialog holds on a wide screen, so
          * an admin gets the picture, the colour, the note, roles and removals here, and everyone
          * else gets the note and who is in the space, grouped by what each of them can do.
          */}
        {currentSpace ? (
          <Card order={1}>
            <CardTitle icon={<Users className="h-3.5 w-3.5" aria-hidden />} category="amber">
              {roleCanManageMembers(currentSpace.role) ? 'This space' : 'About this space'}
            </CardTitle>
            <div className="mt-4">
              <SpaceSettingsPanel
                space={currentSpace}
                currentUserId={user.id}
                onChanged={() => void refreshSpaces()}
                onInvite={
                  roleCanManageMembers(currentSpace.role)
                    ? () => setSpaceInviteOpen(true)
                    : undefined
                }
                onLeft={() => navigate('/')}
              />
            </div>
          </Card>
        ) : null}

        {/*
          * From here down the cards are unrelated to each other and vary in height, so from `lg` they
          * are packed rather than laid in rows — see Masonry for why neither a plain grid nor CSS
          * columns can do it. The hero and the space's own panel stay full width above this: one is
          * the page's subject and the other is the space's, and neither is a settings card sitting
          * beside another settings card.
          *
          * Two columns and no third tier. The page is capped at 74rem, so a third would put every
          * card in about 380px — and the notes-style card alone holds two preview tiles side by
          * side. Wide enough to read beats one more column.
          */}
        <Masonry className="lg:grid-cols-2">
        {/* ---------------------------------------------------------------- history
          *
          * Owner and admin only, which is the same rule the header's button follows. Everyone in a
          * space can see what the space is and who is in it; a record of what each person did is
          * the part that belongs to whoever answers for the space.
          */}
        {currentSpace && roleCanManageMembers(currentSpace.role) ? (
          <Card order={2}>
            <CardTitle icon={<History className="h-3.5 w-3.5" aria-hidden />} category="rose">
              History
            </CardTitle>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
              Everything anyone has added, changed or deleted in this space, with who did it and
              when — searchable, and kept for a year.
            </p>
            <div className="mt-4">
              <Button
                variant="subtle"
                size="sm"
                onClick={() => navigate(`/s/${currentSpace.id}/activity`)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Open the record
                </span>
              </Button>
            </div>
          </Card>
        ) : null}

        {/* ------------------------------------------------------------- details
          *
          * Your name and picture, and only outside a space. In one, this screen belongs to the
          * space; your own account is behind Return home below, where the sidebar puts it too.
          */}
        {currentSpace ? null : (
        <Card order={cardOrder(1)}>
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

        )}

        {/* -------------------------------------------------------- navigation */}
        <Card order={cardOrder(2)}>
          <CardTitle icon={<Compass className="h-3.5 w-3.5" aria-hidden />} category="teal">
            Navigation
          </CardTitle>
          <NavigationSettings />
        </Card>

        {/* ------------------------------------------------------------ theme
          *
          * Per-device, not per-account, and the one setting on this page that is. Which room you
          * want is a fact about the screen in front of you — a bright office, a dark bedroom — so it
          * stays with the device rather than following you onto someone else's. Same reasoning as
          * tiles per row further down, which is stored per screen size for the same reason.
          */}
        <Card order={cardOrder(3)}>
          <CardTitle icon={<Palette className="h-3.5 w-3.5" aria-hidden />} category="amber">
            Theme
          </CardTitle>
          <ThemeSettings />
        </Card>

        {/* ---------------------------------------------------------- typography
          *
          * Personal, and never a space's. Two people in a shared space read the same notes, but which
          * face those are easier to read in is a property of the reader — unlike the tab order and the
          * note style above and below it, which describe the workspace and are shared.
          */}
        <Card order={cardOrder(4)}>
          <CardTitle icon={<Type className="h-3.5 w-3.5" aria-hidden />} category="rose">
            Typography
          </CardTitle>
          <FontSettings />
        </Card>

        {/* ------------------------------------------------------ text spacing
          *
          * A separate card from Typography rather than another tab inside its dialog: the face is
          * a choice you make once and mostly forget, this is something you tune by eye and revisit
          * — and the two together in one dialog is a wall of controls with two very different
          * rhythms of use hiding behind one "Change fonts" button. Personal, for the reason the
          * font is: which spacing reads best is a property of the reader, not the space.
          */}
        <Card order={cardOrder(5)}>
          <CardTitle icon={<ALargeSmall className="h-3.5 w-3.5" aria-hidden />} category="rose">
            Text spacing
          </CardTitle>
          <TypeAdjustmentSettings />
        </Card>

        {/* --------------------------------------------------------- notes style */}
        <Card order={cardOrder(6)}>
          <CardTitle icon={<ClipboardList className="h-3.5 w-3.5" aria-hidden />} category="indigo">
            Notes style
          </CardTitle>
          {display.writesToSpace ? (
            /* Said before the choice, not after it. Changing this changes it for everybody in the
             * space, and that is not something to discover from somebody else's screen. */
            <Notice className="mt-3">
              Shared with everyone in {display.spaceName ?? 'this space'}.
            </Notice>
          ) : null}
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

        {/* ------------------------------------------------------- smallest card */}
        <Card order={cardOrder(7)}>
          <CardTitle icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden />} category="teal">
            Cards per row
          </CardTitle>
          {/* One line. This card used to open with a four-sentence paragraph explaining that the
              number is a floor rather than a fixed width — but the live preview directly below it
              shows exactly that, and a card nobody reads to the end explains nothing. The detail
              that survived is the one the preview can't show: cards can still be dragged wider. */}
          <p className="mt-2.5 text-[12.5px] text-[var(--color-text-muted)]">
            The narrowest a card may get — any card can still be dragged wider.
          </p>

          {/* Which screen this is setting. The counts differ enough between a phone and a desktop
              that one number for the account was never really one choice — it was a desktop
              choice being clamped on the phone. */}
          <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-hover)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-text-muted)]">
            <Monitor className="h-3 w-3 shrink-0" aria-hidden />
            {tileBand.label} screens · max {maxTilesPerRow}
          </p>

          {/* A live miniature of the choice: how wide the smallest card can be. */}
          <div
            className="mt-3.5 flex gap-1.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5"
            aria-hidden
          >
            {Array.from({ length: effectivePerRow }, (_, index) => (
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

          {/* Only reachable from a choice made before this became per-screen: those still seed a
              band nobody has set yet, and one of them can be higher than this band allows. Picking
              anything here writes this screen's own value and the note goes for good. */}
          {typeof tilesPerRow === 'number' && tilesPerRow > maxTilesPerRow ? (
            <p className="mt-2.5 text-[11.5px] text-[var(--color-text-muted)]">
              Using {maxTilesPerRow} here — your old {tilesPerRow} came from before this was per
              screen. Pick one above to set it.
            </p>
          ) : null}
        </Card>

        {/* --------------------------------------------------------------- the way out

            On its own card rather than a loose slab under the stack. In a space the last card is
            the way back to your own notes and account — signing out from inside somebody else's
            workspace is not the thing you came to this screen for, and it is one tap further on.
            Outside one it is the sign out, the one destructive thing here, in an outline that
            fills on hover rather than shouting every time the page opens. */}
        <Card order={cardOrder(8)} className="flex flex-wrap items-center justify-between gap-3">
          {currentSpace ? (
            <>
              <span className="text-[13px] text-[var(--color-text-muted)]">
                You're in{' '}
                <span className="font-medium text-[var(--color-text)]">{currentSpace.name}</span>
              </span>
              <Button variant="primary" size="sm" onClick={() => navigate('/')}>
                <span className="inline-flex items-center gap-1.5">
                  <Home className="h-4 w-4" aria-hidden />
                  Return home
                </span>
              </Button>
            </>
          ) : (
            <>
              <span className="text-[13px] text-[var(--color-text-muted)]">
                Signed in as{' '}
                <span className="font-medium text-[var(--color-text)]">{user.email}</span>
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
            </>
          )}
        </Card>
        </Masonry>
      </div>

      {/* The one thing on this screen that still wants a dialog: inviting is a short form with a
        * generated link at the end of it, and the same screen serves every entry point. */}
      {currentSpace ? (
        <InviteMemberDialog
          open={spaceInviteOpen}
          spaceName={currentSpace.name}
          onClose={() => setSpaceInviteOpen(false)}
          onInvite={(email, role) => invite(currentSpace.id, email, role)}
        />
      ) : null}
    </div>
  )
}
