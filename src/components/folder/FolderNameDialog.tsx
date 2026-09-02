import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Folder, Globe, Lock, Users, X } from 'lucide-react'
import type { ContentVisibility } from '../../types'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { VISIBILITY_LABELS, VISIBILITY_LEVELS } from '../../lib/contentPrivacy'
import { cn } from '../../lib/cn'

export interface FolderNameDialogProps {
  open: boolean
  title: string
  confirmLabel?: string
  busyLabel?: string
  initialName?: string
  /**
   * Offers the three visibility levels alongside the name.
   *
   * Only passed when creating inside a space. Not shown when renaming — the level of an existing
   * folder is changed from its own menu, where the full share sheet lives and where the list of
   * people belongs; a rename dialog is not the place to discover that the audience changed.
   */
  withVisibility?: boolean
  onClose: () => void
  onSubmit: (name: string, visibility?: ContentVisibility) => void | Promise<unknown>
}

const VISIBILITY_ICONS = { private: Lock, restricted: Users, space: Globe } as const

export function FolderNameDialog({
  open,
  title,
  confirmLabel = 'Save',
  busyLabel = 'Saving…',
  initialName = '',
  withVisibility = false,
  onClose,
  onSubmit,
}: FolderNameDialogProps) {
  const [name, setName] = useState(initialName)
  const [visibility, setVisibility] = useState<ContentVisibility>('space')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const fieldId = useId()

  useEffect(() => {
    if (open) {
      setName(initialName)
      setVisibility('space')
      setSubmitting(false)
    }
  }, [initialName, open])

  useDialogFocus(open, inputRef)

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, submitting])

  if (!open) {
    return null
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || submitting) {
      return
    }
    setSubmitting(true)
    /*
     * "Selected people" is not offered here, and that is deliberate rather than an omission. Choosing
     * names needs the member list, which needs room this dialog does not have — and a folder created
     * as Everyone or Only me can be narrowed from its own menu a second later, where the share sheet
     * has the space to show who is being chosen and what they will also start receiving.
     */
    void Promise.resolve(onSubmit(trimmed, withVisibility ? visibility : undefined))
      .then(() => {
        onClose()
      })
      .catch(() => {
        /* persistError banner explains the failure */
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="anim-overlay-in absolute inset-0 bg-black/30"
        onClick={submitting ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-dialog-in relative flex max-h-[min(90vh,32rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--color-accent-soft)' }}
              aria-hidden
            >
              <Folder className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
            </span>
            <h2 id={titleId} className="text-[15px] font-semibold text-[var(--color-text)]">
              {title}
            </h2>
          </div>
          <IconButton label="Close" onClick={submitting ? undefined : onClose} disabled={submitting}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <form className="overflow-y-auto px-4 py-4" onSubmit={handleSubmit}>
          <label htmlFor={fieldId} className="block text-sm font-medium text-[var(--color-text-muted)]">
            Folder name
          </label>
          <input
            ref={inputRef}
            id={fieldId}
            name="folder-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
            autoComplete="off"
          />
          {withVisibility ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-[var(--color-text-muted)]">Who can see it</p>
              <div
                role="radiogroup"
                aria-label="Who can see this folder"
                className="mt-2 grid grid-cols-2 gap-2"
              >
                {VISIBILITY_LEVELS.filter((level) => level !== 'restricted').map((level) => {
                  const Icon = VISIBILITY_ICONS[level]
                  const active = visibility === level
                  return (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={submitting}
                      onClick={() => setVisibility(level)}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors',
                        active
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
                      )}
                    >
                      <Icon
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: active ? 'var(--color-accent)' : undefined }}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{VISIBILITY_LABELS[level]}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[12px] leading-snug text-[var(--color-text-muted)]">
                {visibility === 'private'
                  ? 'Nobody else will see this folder, or anything you put in it.'
                  : 'Everyone in this space will see it. You can share individual notes more narrowly.'}
              </p>
            </div>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="subtle" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!name.trim() || submitting}>
              {submitting ? busyLabel : confirmLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
