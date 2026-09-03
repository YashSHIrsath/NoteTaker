import { useState } from 'react'
import { DoorOpen, History, LogOut, RefreshCw, Sparkles, Users } from 'lucide-react'
import { IconButton } from '../ui/IconButton'
import { ProjectLogo } from '../brand/ProjectLogo'
import { LogoLoader } from '../brand/LogoLoader'
import { WorkspaceSwitcher } from '../space/WorkspaceSwitcher'
import { GlobalSearch } from '../search/GlobalSearch'
import { ThemeSwitcher } from './ThemeSwitcher'
import { SpaceAvatar } from '../space/SpaceAvatar'
import { SpacesMenu } from '../space/SpacesMenu'
import { useAuth } from '../../hooks/useAuth'
import { useSpaces } from '../../hooks/useSpaces'
import { useRefreshWorkspace } from '../../hooks/useRefreshWorkspace'
import { useSpaceId } from '../../hooks/useWorkspace'
import { roleCanManageMembers } from '../../lib/spaceRoles'
import { readFontChoice } from '../../lib/fonts'
import { currentFontPreset, nextFontPreset, presetTriple } from '../../lib/fontPresets'
import { cn } from '../../lib/cn'
import { useNavigate } from 'react-router-dom'

export interface HeaderProps {
  className?: string
}

/** The app's mark, as the workspace switcher's face below `lg`. From `lg` the sidebar is on
 *  screen and carries the brand itself, so this header shows none. */
function Mark() {
  return <ProjectLogo className="h-4 w-[22px] text-[var(--color-accent)]" label="Mindstack" />
}

/** The blob: somebody is waiting on you. Ringed in the header's own surface so it reads as sitting
 *  on top of the glyph rather than as part of it, at any accent. */
function PendingDot() {
  return (
    <span
      aria-hidden
      className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--color-accent)] ring-2 ring-[var(--color-surface)]"
    />
  )
}

export function Header({ className }: HeaderProps) {
  const { user, signOut, updateProfile } = useAuth()
  // Only inside a shared space: personal notes have no activity log, because there is nobody to
  // attribute anything to. And only for an owner or admin — everyone else sees what a space is and
  // who is in it, not a record of what each of them did.
  const spaceId = useSpaceId()
  const { getSpace, invites } = useSpaces()
  const currentSpace = spaceId ? getSpace(spaceId) : undefined
  const canSeeHistory = currentSpace ? roleCanManageMembers(currentSpace.role) : false
  const navigate = useNavigate()

  /**
   * The same refresh the pull-down gesture performs, for everyone who cannot pull one.
   *
   * A pointer has no equivalent of dragging past the top of a list, and the poll behind all of this
   * is on a twenty-second timer — long enough that somebody who *knows* a colleague just changed
   * something wants to be able to say so. The spin is held for a moment even when the read comes
   * back instantly, because a button that flickers reads as a button that did nothing.
   */
  const refreshWorkspace = useRefreshWorkspace()
  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = () => {
    if (refreshing) {
      return
    }
    setRefreshing(true)
    void Promise.all([
      refreshWorkspace(),
      new Promise((resolve) => window.setTimeout(resolve, 500)),
    ]).finally(() => setRefreshing(false))
  }
  const [spacesOpen, setSpacesOpen] = useState(false)

  const handleSignOut = () => {
    void signOut().catch(() => undefined)
  }

  /**
   * One press, the whole app in a different set of faces.
   *
   * Unlike the theme toggle this presses, this cannot be instant: a theme lives in localStorage and
   * flips synchronously, but a font choice is account metadata behind a real request. `applying` is
   * what stands in for that half-second — held so a second tap mid-flight cannot fire a request
   * that lands ahead of the one already in the air and cycle two steps for one press, and shown on
   * the glyph so the button does not look like it did nothing while it waits.
   *
   * The next preset is computed from the account's *actual* current three choices, not from local
   * state this component would otherwise have to keep in step with Settings and the header both —
   * so pressing this after hand-picking a mix of faces in Settings starts the circle over at the
   * first preset rather than pretending the mix was already on it.
   */
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  // What the account is actually showing right now, resolved the same way the rest of the app
  // resolves it (fallbacks, the note-inherits-interface rule) — not the raw, possibly-unset
  // metadata, which would misjudge "custom" for an account that has never touched a font setting.
  const currentFontIds = {
    body: readFontChoice('body', metadata).id,
    heading: readFontChoice('heading', metadata).id,
    note: readFontChoice('note', metadata).id,
  }
  const currentPresetLabel = currentFontPreset(currentFontIds)?.label ?? 'Custom'
  const nextPreset = nextFontPreset(currentFontIds)
  const [applyingFonts, setApplyingFonts] = useState(false)
  const cycleFontPreset = () => {
    if (applyingFonts) {
      return
    }
    setApplyingFonts(true)
    void updateProfile({ fonts: presetTriple(nextPreset) })
      .catch(() => undefined)
      .finally(() => setApplyingFonts(false))
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
        // The shell takes the status-bar inset from lg, because the sidebar reaches the top of
        // the window there too and this is no longer the only thing that has to clear it. Left in
        // both places it would be counted twice.
        'pt-[env(safe-area-inset-top)] lg:pt-0',
        className,
      )}
    >
      {/*
        * The brand, below `lg` only.
        *
        * From `lg` the sidebar is a full-height island starting at the same line as this one, with
        * the mark and the workspace switcher already in its top row — so drawing them again here
        * put the app's name twice on one screen, a centimetre apart, and spent the room the search
        * bar wanted. Below `lg` there is no sidebar and this is the only place either can live.
        */}
      <div className="flex shrink-0 items-center gap-2 lg:hidden">
        {/*
          * The mark *is* the workspace switcher here.
          *
          * Which workspace you are in and how to leave it is the sidebar's job — and at this width
          * there is no sidebar, so it was nobody's. The top-left corner is where that control lives
          * in every app that has one, and the mark is already sitting in it.
          *
          * The same WorkspaceSwitcher as the sidebar's, wearing the mark instead of a name, so the
          * two cannot drift about what a workspace is or which one you are in.
          */}
        <WorkspaceSwitcher trigger={<Mark />} />
        {/* The app's own name, in a space as much as in your own notes.
          *
          * This briefly showed the space's name instead, which put a workspace label where the
          * product's identity belongs. Which space you are in is the sidebar's job — see
          * WorkspaceSwitcher — and on a phone the Spaces tab in the bottom bar carries it.
          *
          * --font-brand, not --font-display: heading faces are a preference now, and the wordmark is
          * the one piece of type in the app that must not follow it. */}
        <h1
          // Dropped on the narrowest screens: the search bar needs the room far more, and the
          // bottom bar now carries the app's identity/navigation there.
          className="hidden shrink-0 whitespace-nowrap px-0.5 text-base font-semibold tracking-tight text-[var(--color-text)] sm:inline sm:text-lg"
          style={{ fontFamily: 'var(--font-brand)' }}
        >
          Mindstack
        </h1>
      </div>

      <GlobalSearch className="min-w-0 max-w-xl flex-1" />

      {/* ml-auto because the search bar is capped at max-w-xl: on a wide screen it stops growing
          and the leftover space would otherwise pile up after these controls, leaving them
          stranded mid-header instead of at the right edge. */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {/*
          * Spaces, below `lg` only — above it the sidebar has a Spaces row of its own.
          *
          * It sat in the bottom bar, which made the bar six items and put a list of workspaces
          * beside the four pages you work in. Up here it is one control with one job in each
          * workspace: from your own notes it goes to the spaces page, and from inside a space it
          * opens the spaces so you can switch or step out. Inside one it also wears that space's
          * face, so the header says which workspace you are in without taking the app's name.
          */}
        {/* A pending invitation is somebody waiting on an answer from you, so the dot rides
          * whichever of these two the workspace puts here — on a phone this and the bottom bar are
          * the only chrome there is, and neither had anywhere else to say it. */}
        {currentSpace ? (
          <IconButton
            label={
              invites.length > 0
                ? `Switch or leave ${currentSpace.name} — ${invites.length} invitation${invites.length === 1 ? '' : 's'} waiting`
                : `Switch or leave ${currentSpace.name}`
            }
            tooltip="Switch or leave"
            onClick={() => setSpacesOpen((value) => !value)}
            className="relative lg:hidden"
          >
            <SpaceAvatar
              spaceId={currentSpace.id}
              color={currentSpace.color}
              imageUrl={currentSpace.imageUrl}
              className="h-5 w-5 rounded"
              iconClassName="h-3 w-3"
            />
            {invites.length > 0 ? <PendingDot /> : null}
          </IconButton>
        ) : (
          <IconButton
            label={
              invites.length > 0
                ? `Shared spaces — ${invites.length} invitation${invites.length === 1 ? '' : 's'} waiting`
                : 'Shared spaces'
            }
            tooltip="Shared spaces"
            onClick={() => navigate('/spaces')}
            className="relative lg:hidden"
          >
            <Users className="h-5 w-5" />
            {invites.length > 0 ? <PendingDot /> : null}
          </IconButton>
        )}

        {canSeeHistory && spaceId ? (
          <IconButton label="Activity in this space" onClick={() => navigate(`/s/${spaceId}/activity`)}>
            <History className="h-5 w-5" />
          </IconButton>
        ) : null}

        <IconButton
          label={refreshing ? 'Refreshing' : 'Refresh'}
          tooltip="Refresh"
          onClick={handleRefresh}
          aria-busy={refreshing}
        >
          {/* The mark playing, not a spinning arrow: loading looks the same here as it does on
            * the splash and under a pull. */}
          {refreshing ? (
            <LogoLoader size="sm" className="text-[var(--color-accent)]" />
          ) : (
            <RefreshCw className="h-5 w-5" />
          )}
        </IconButton>

        <ThemeSwitcher />

        {/* The theme's neighbour, deliberately, and pressed the same way: five curated looks in a
          * ring, one press cycles to the next, applied to all three roles at once — see
          * lib/fontPresets. Fine control over one role at a time is still Settings' job, reached
          * from the account page rather than duplicated here; this button is for "surprise me". */}
        <IconButton
          label={`Fonts: ${currentPresetLabel}. Switch to ${nextPreset.label}`}
          tooltip="Fonts"
          onClick={cycleFontPreset}
          aria-busy={applyingFonts}
        >
          {applyingFonts ? (
            <LogoLoader size="sm" className="text-[var(--color-accent)]" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </IconButton>

        {/* A Starred shortcut used to sit here, shown from lg. Which is precisely where the
            sidebar is — with Starred already in it, as a labelled row. The header was offering a
            second, unlabelled way to the same page in the one layout that least needed it. */}
        {/* The one-off "move my local notes into Supabase" button used to sit here, behind a DEV
            guard. That migration has been run, so in development — the only place it ever showed —
            it was a button occupying the header for a job already finished. Its component and the
            service behind it are still in the tree and still covered by the checks; putting it
            back is one <DevMigrateNotesButton /> in this slot. */}

        {/*
          * The last button is "the way out of where you are", which is a different door in each
          * workspace.
          *
          * From lg, sign out lives in the sidebar's account row beside the face and name it signs
          * out of. Below lg there's no sidebar, so it sits here. Inside a space, though, signing
          * out is not what this corner is for — stepping back into your own notes is, and offering
          * the destructive one instead put an account-wide action where a workspace-wide one
          * belongs. Signing out is then on your own profile, one tap past this.
          */}
        {currentSpace ? (
          <IconButton
            label="Leave this space and return to your own notes"
            tooltip="Exit this space"
            onClick={() => navigate('/')}
            className="lg:hidden"
          >
            <DoorOpen className="h-5 w-5" />
          </IconButton>
        ) : (
          <IconButton label="Sign out" onClick={handleSignOut} className="lg:hidden">
            <LogOut className="h-5 w-5" />
          </IconButton>
        )}
      </div>

      <SpacesMenu open={spacesOpen} onClose={() => setSpacesOpen(false)} />
    </header>
  )
}
