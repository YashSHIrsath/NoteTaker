import { useState } from 'react'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { RepositoryError } from '../../repositories/errors'
import { migrateLocalNotesToSupabase } from '../../services/migration/runLocalNotesMigration'

/** Development-only trigger. Not shown in production builds. */
export function DevMigrateNotesButton() {
  const { user } = useAuth()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!import.meta.env.DEV) {
    return null
  }

  const handleClick = async () => {
    if (!user) {
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const result = await migrateLocalNotesToSupabase(user.id)
      if (result.status === 'already_complete') {
        setMessage('Already migrated.')
      } else {
        setMessage(`Migrated ${result.folderCount} folders.`)
      }
    } catch (error) {
      setMessage(error instanceof RepositoryError ? error.message : 'Could not migrate notes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-[9rem] flex-col items-end">
      <Button size="sm" variant="subtle" disabled={busy || !user} onClick={() => void handleClick()}>
        {busy ? 'Migrating…' : 'Migrate'}
      </Button>
      {message ? (
        <p className="mt-0.5 truncate text-[10px] text-[var(--color-text-muted)]" title={message}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
