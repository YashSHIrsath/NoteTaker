import { Globe, Lock, Users } from 'lucide-react'
import type { ContentVisibility } from '../../types'
import { VISIBILITY_LABELS } from '../../lib/contentPrivacy'
import { cn } from '../../lib/cn'

export interface VisibilityBadgeProps {
  /** What this item actually reaches, folders above it included — not its own setting. See
   *  folderChainVisibility: a note marked Everyone inside a private folder reaches one person, and a
   *  badge saying "Everyone" there would be describing a setting rather than the world. */
  visibility: ContentVisibility
  /** True when the item's own level is wider than this, so the difference can be explained on hover
   *  instead of looking like a bug. */
  narrowedByParent?: boolean
  /** Icon only. What every row and card uses — the word is for the share sheet, where there is room
   *  for it and a choice being made. */
  compact?: boolean
  className?: string
}

const ICONS = { private: Lock, restricted: Users, space: Globe } as const

/**
 * The one place an item says how far it reaches.
 *
 * Deliberately absent for 'space', in every presentation. Everything in a shared space was visible to
 * everyone until this feature existed, so "Everyone" is the state of almost every row — a badge on
 * all of them would be a wall of identical icons that says nothing, and the two that matter would be
 * lost in it. A badge here means "this one is different", which is the only reason to look.
 *
 * Nothing here is a permission check. The row is on screen because the database let it through; this
 * describes what it let through and to whom.
 */
export function VisibilityBadge({
  visibility,
  narrowedByParent = false,
  compact = true,
  className,
}: VisibilityBadgeProps) {
  if (visibility === 'space') {
    return null
  }

  const Icon = ICONS[visibility]
  const label = VISIBILITY_LABELS[visibility]
  const title = narrowedByParent
    ? `${label} — because of the folder it is in`
    : label

  if (compact) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center text-[var(--color-text-muted)]', className)}
        title={title}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {/* The icon is decorative; this is what a screen reader gets, and it says the same thing. */}
        <span className="sr-only">{title}</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium',
        'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
        className,
      )}
      title={narrowedByParent ? 'Because of the folder it is in' : undefined}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}
