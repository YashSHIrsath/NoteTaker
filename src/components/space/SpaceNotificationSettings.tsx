import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import type { SpaceNotificationPrefs } from '../../types'
import { getSpacesRepository, RepositoryError } from '../../repositories'
import { Notice } from '../ui/Notice'
import { cn } from '../../lib/cn'

export interface SpaceNotificationSettingsProps {
  spaceId: string
}

/** The three classes, in the order they matter to somebody deciding. */
const SWITCHES = [
  {
    key: 'reminders' as const,
    label: 'Reminders',
    detail: 'Reminders anyone sets on notes you can see.',
  },
  {
    key: 'dueDates' as const,
    label: 'Deadlines',
    detail: 'When something you can see is due, and when it is finished.',
  },
  {
    key: 'contentUpdates' as const,
    label: 'Edits',
    detail: 'When someone changes a note you can see.',
  },
]

/**
 * Which emails this account wants from this space.
 *
 * Per space rather than per account, because that is the unit the choice is about — "tell me about
 * the work space, not the house-move space" is a sentence people mean, and one global switch is not.
 *
 * The line at the bottom is the important part of this component. These switches can only ever make
 * you receive *less*: the database checks access first and consults a preference second, so turning
 * everything on cannot surface anything you cannot already open. Saying so is what stops this reading
 * like a second, competing permission system sitting next to the real one.
 */
export function SpaceNotificationSettings({ spaceId }: SpaceNotificationSettingsProps) {
  const repository = getSpacesRepository()
  const [prefs, setPrefs] = useState<SpaceNotificationPrefs | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repository) {
      return
    }
    let cancelled = false
    void repository
      .getNotificationPrefs(spaceId)
      .then((next) => {
        if (!cancelled) {
          setPrefs(next)
        }
      })
      .catch(() => {
        /* Left null, which renders nothing. A settings row that cannot be read is not worth an
           error banner over the space's own settings. */
      })
    return () => {
      cancelled = true
    }
  }, [repository, spaceId])

  const toggle = useCallback(
    (key: 'reminders' | 'dueDates' | 'contentUpdates') => {
      if (!repository || !prefs || busy) {
        return
      }
      const next = !prefs[key]
      setBusy(key)
      setError(null)
      // Optimistic: the switch moves under the finger, and is put back if the write is refused.
      setPrefs({ ...prefs, [key]: next })
      void repository
        .setNotificationPrefs(spaceId, { [key]: next })
        .then((resolved) => setPrefs(resolved))
        .catch((caught: unknown) => {
          setPrefs(prefs)
          setError(
            caught instanceof RepositoryError
              ? caught.message
              : 'Could not save your notification settings.',
          )
        })
        .finally(() => setBusy(null))
    },
    [busy, prefs, repository, spaceId],
  )

  if (!prefs) {
    return null
  }

  return (
    <div className="mt-4 border-t border-[var(--color-border)] pt-4">
      <div className="flex items-center gap-2">
        <Bell className="h-3.5 w-3.5 text-[var(--color-text-muted)]" aria-hidden />
        <h3 className="text-[13px] font-semibold text-[var(--color-text)]">Email me about</h3>
      </div>

      <ul className="mt-2 flex flex-col gap-1">
        {SWITCHES.map((item) => {
          const on = prefs[item.key]
          return (
            <li key={item.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={busy !== null}
                onClick={() => toggle(item.key)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-hover)] disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-[var(--color-text)]">{item.label}</span>
                  <span className="block truncate text-[11.5px] text-[var(--color-text-muted)]">
                    {item.detail}
                  </span>
                </span>
                <span
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
                    on ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border-strong)]',
                  )}
                  aria-hidden
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                      on ? 'translate-x-[18px]' : 'translate-x-0.5',
                    )}
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-2 px-2 text-[11.5px] leading-snug text-[var(--color-text-muted)]">
        You are only ever emailed about things you can open. Turning these on cannot show you
        anything more.
      </p>

      {error ? (
        <div className="mt-2">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
    </div>
  )
}
