import type { Attachment, Subtask } from '../types'
import { parseContentBlocks } from './taskContentBlocks'
import { getChildSubtasks } from './subtasks'

// BlockNote persists its document as JSON in the same `content` column older notes used for
// plain text. Attachments can't be embedded as real URLs (Supabase gives out short-lived
// signed URLs), so blocks reference them as `attachment://<id>` and `resolveFileUrl` swaps
// that for a fresh signed URL whenever the editor actually needs to display it.
const ATTACHMENT_URL_SCHEME = 'attachment://'

export function attachmentUrlFor(attachmentId: string): string {
  return `${ATTACHMENT_URL_SCHEME}${attachmentId}`
}

export function attachmentIdFromUrl(url: string): string | null {
  return url.startsWith(ATTACHMENT_URL_SCHEME) ? url.slice(ATTACHMENT_URL_SCHEME.length) : null
}

export function isBlockNoteContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed.startsWith('[')) {
    return false
  }
  try {
    return Array.isArray(JSON.parse(trimmed))
  } catch {
    return false
  }
}

// Minimal shape we rely on — looser than BlockNote's own generics, since this is just JSON
// round-tripping through a database column, not authoring content against a typed schema.
export interface StoredInlineText {
  type: string
  text?: string
}

export interface StoredBlock {
  id?: string
  type: string
  props?: Record<string, unknown>
  content?: StoredInlineText[]
  children?: StoredBlock[]
}

function textBlock(text: string): StoredBlock {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }
}

function attachmentBlock(attachment: Attachment): StoredBlock {
  return {
    type: attachment.isImage ? 'image' : 'file',
    // Attachments show as a compact name+icon box rather than a full inline preview; clicking
    // one opens the real content in a dialog instead.
    props: { url: attachmentUrlFor(attachment.id), name: attachment.name, showPreview: false },
  }
}

function subtaskBlock(subtask: Subtask, allSubtasks: Subtask[]): StoredBlock {
  return {
    type: 'checkListItem',
    props: { checked: subtask.completed },
    content: subtask.title ? [{ type: 'text', text: subtask.title }] : [],
    children: getChildSubtasks(allSubtasks, subtask.id).map((child) => subtaskBlock(child, allSubtasks)),
  }
}

const EMPTY_DOCUMENT: StoredBlock[] = [{ type: 'paragraph', content: [] }]

/**
 * Builds the blocks BlockNote should start from. New notes already store BlockNote JSON and
 * pass straight through; notes written before this migration are plain text with inline
 * markers (see taskContentBlocks.ts) and get converted once, in place — the very next edit
 * persists the real JSON, so this only ever runs against the original legacy string.
 */
export function buildInitialBlocks(content: string, attachments: Attachment[], subtasks: Subtask[]): StoredBlock[] {
  if (isBlockNoteContent(content)) {
    const parsed = JSON.parse(content) as StoredBlock[]
    return parsed.length > 0 ? parsed : EMPTY_DOCUMENT
  }

  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]))
  const subtasksById = new Map(subtasks.map((subtask) => [subtask.id, subtask]))
  const placedSubtaskIds = new Set<string>()
  const blocks: StoredBlock[] = []

  for (const segment of parseContentBlocks(content)) {
    if (segment.type === 'text') {
      for (const line of segment.text.split('\n')) {
        blocks.push(textBlock(line))
      }
    } else if (segment.type === 'attachment') {
      const attachment = attachmentsById.get(segment.attachmentId)
      if (attachment) {
        blocks.push(attachmentBlock(attachment))
      }
    } else {
      const subtask = subtasksById.get(segment.subtaskId)
      if (subtask && subtask.parentSubtaskId === null) {
        blocks.push(subtaskBlock(subtask, subtasks))
        placedSubtaskIds.add(subtask.id)
      }
    }
  }

  for (const subtask of getChildSubtasks(subtasks, null)) {
    if (!placedSubtaskIds.has(subtask.id)) {
      blocks.push(subtaskBlock(subtask, subtasks))
    }
  }

  return blocks.length > 0 ? blocks : EMPTY_DOCUMENT
}

/** Resolves a clicked block's attachment id straight from stored content — for read-only
 * viewers (e.g. the folder-grid card) that render a document without holding a live editor
 * instance to call `getBlock` on. */
export function findBlockAttachmentId(content: string, blockId: string): string | null {
  if (!isBlockNoteContent(content)) {
    return null
  }
  const blocks = JSON.parse(content) as StoredBlock[]

  const find = (list: StoredBlock[]): StoredBlock | null => {
    for (const block of list) {
      if (block.id === blockId) {
        return block
      }
      if (block.children) {
        const found = find(block.children)
        if (found) {
          return found
        }
      }
    }
    return null
  }

  const block = find(blocks)
  const url = typeof block?.props?.url === 'string' ? block.props.url : ''
  return attachmentIdFromUrl(url)
}

/** Every attachment id still referenced by a block in the document. Deleting an attachment's
 * block from the text doesn't delete the underlying attachment record, so an "all attachments
 * for this task" bar needs this filter or it keeps showing ones no longer in the note. */
export function referencedAttachmentIds(content: string): Set<string> {
  const ids = new Set<string>()
  if (!isBlockNoteContent(content)) {
    return ids
  }
  const blocks = JSON.parse(content) as StoredBlock[]

  const visit = (list: StoredBlock[]): void => {
    for (const block of list) {
      const url = typeof block.props?.url === 'string' ? block.props.url : ''
      const attachmentId = attachmentIdFromUrl(url)
      if (attachmentId) {
        ids.add(attachmentId)
      }
      if (block.children) {
        visit(block.children)
      }
    }
  }

  visit(blocks)
  return ids
}

