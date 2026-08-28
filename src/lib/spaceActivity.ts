import type { ComponentType } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderInput,
  FolderPlus,
  Paperclip,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react'
import type { SpaceActivityAction, SpaceActivityEntry } from '../types'

/**
 * The kinds of change, in the order a filter should offer them.
 *
 * Not alphabetical and not the order the type happens to declare: the ones people look for lead.
 * "What was deleted" and "what was added" are why anybody opens a log; "unstarred" is not.
 */
export const ACTIVITY_ACTIONS: SpaceActivityAction[] = [
  'created',
  'deleted',
  'content_edited',
  'renamed',
  'moved',
  'completed',
  'reopened',
  'due_changed',
  'starred',
  'unstarred',
  'attachment_added',
  'attachment_removed',
  'updated',
]

/** Each kind as a filter reads it — a name for the category, not a sentence about one row. */
export const ACTION_LABELS: Record<SpaceActivityAction, string> = {
  created: 'Added',
  deleted: 'Deleted',
  content_edited: 'Edited',
  renamed: 'Renamed',
  moved: 'Moved',
  completed: 'Completed',
  reopened: 'Reopened',
  due_changed: 'Deadline changed',
  starred: 'Starred',
  unstarred: 'Unstarred',
  attachment_added: 'File attached',
  attachment_removed: 'File removed',
  updated: 'Other changes',
}

export const ACTION_ICONS: Record<SpaceActivityAction, ComponentType<{ className?: string }>> = {
  created: FolderPlus,
  deleted: Trash2,
  renamed: Pencil,
  moved: FolderInput,
  completed: CheckCircle2,
  reopened: RotateCcw,
  due_changed: CalendarClock,
  content_edited: FileText,
  starred: Star,
  unstarred: StarOff,
  attachment_added: Paperclip,
  attachment_removed: Paperclip,
  updated: Pencil,
}

const ENTITY_WORDS: Record<SpaceActivityEntry['entityType'], string> = {
  folder: 'folder',
  task: 'note',
  subtask: 'checklist item',
  attachment: 'file',
}

/**
 * What happened, as the phrase that goes in the pill.
 *
 * Built from the action and the entity, both of which the database derived from the row itself — so
 * this reads the same whether or not the client that made the change bothered to declare an intent.
 * The intent, when there is one, is shown underneath as the person's own account of it rather than
 * being substituted for this.
 *
 * Deliberately not the person's name plus this: the actor and the action are two separate pills, so
 * "who" can be scanned down one column and "what" down another.
 */
export function describeAction(entry: SpaceActivityEntry): string {
  const noun = ENTITY_WORDS[entry.entityType]
  switch (entry.action) {
    case 'created':
      return `added a ${noun}`
    case 'deleted':
      return `deleted a ${noun}`
    case 'renamed':
      return `renamed a ${noun}`
    case 'moved':
      return `moved a ${noun}`
    case 'completed':
      return `marked a ${noun} done`
    case 'reopened':
      return `reopened a ${noun}`
    case 'due_changed':
      return `changed a ${noun}'s deadline`
    case 'content_edited':
      return `edited a ${noun}`
    case 'starred':
      return `starred a ${noun}`
    case 'unstarred':
      return `unstarred a ${noun}`
    case 'attachment_added':
      return 'attached a file'
    case 'attachment_removed':
      return 'removed a file'
    default:
      return `changed a ${noun}`
  }
}

/** Whose action it was. Falls back through name, address, and finally the fact that somebody did it
 *  — an entry whose actor has since been deleted still has to read as a sentence. */
export function actorLabel(entry: SpaceActivityEntry): string {
  return entry.actorName?.trim() || entry.actorEmail || 'Someone'
}

/** A stamp people can read at a glance — the date only when it isn't today. Matches the wording the
 *  task history panel already uses, so the two read as one system. */
export function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  return date.toLocaleString(undefined, {
    month: sameDay ? undefined : 'short',
    day: sameDay ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
