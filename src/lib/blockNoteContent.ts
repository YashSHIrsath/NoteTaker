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
    // Pictures are shown; other files stay a compact name+icon box and are opened from the
    // note's attachment bar.
    props: {
      url: attachmentUrlFor(attachment.id),
      name: attachment.name,
      showPreview: attachment.isImage,
    },
  }
}

/** Notes written before pictures were shown inline stored them with showPreview: false. Flipping
 *  it as the document loads means an old note looks like a new one without a data migration. */
function withShownImages(blocks: StoredBlock[]): StoredBlock[] {
  return blocks.map((block) => ({
    ...block,
    props: block.type === 'image' ? { ...block.props, showPreview: true } : block.props,
    children: block.children ? withShownImages(block.children) : block.children,
  }))
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

/** A block nobody would call content: an empty paragraph, and nothing else counts as one. */
function isBlankBlock(block: StoredBlock): boolean {
  if (block.type !== 'paragraph') {
    return false
  }
  if (block.children?.some((child) => !isBlankBlock(child))) {
    return false
  }
  return !block.content?.some((run) => (run.text ?? '').trim().length > 0)
}

/**
 * The note's own words, flattened to one line.
 *
 * For list rows, where the folder a note sits in says far less about it than its first sentence
 * does. Deliberately shallow work: runs of text joined in document order, children included,
 * whitespace collapsed, stopped once there is comfortably more than any row will show — a note can
 * be thousands of blocks long and this runs for every row on screen.
 *
 * Blocks that carry no prose contribute nothing: an image or a file block has a filename in its
 * props, and "photo.png" is not what the note says. A checklist item is prose and does count.
 */
export function contentSnippet(content: string, maxLength = 140): string {
  const trimmed = content.trim()
  if (!trimmed) {
    return ''
  }
  if (!isBlockNoteContent(trimmed)) {
    // A note written before the block editor: already plain text.
    return trimmed.replace(/\s+/g, ' ').slice(0, maxLength).trim()
  }

  let blocks: StoredBlock[]
  try {
    blocks = JSON.parse(trimmed) as StoredBlock[]
  } catch {
    return ''
  }

  const parts: string[] = []
  let length = 0

  const walk = (list: StoredBlock[]): void => {
    for (const block of list) {
      if (length > maxLength) {
        return
      }
      for (const run of block.content ?? []) {
        const text = (run.text ?? '').trim()
        if (text) {
          parts.push(text)
          length += text.length + 1
        }
      }
      if (block.children?.length) {
        walk(block.children)
      }
    }
  }
  walk(blocks)

  return parts.join(' ').replace(/\s+/g, ' ').slice(0, maxLength).trim()
}

/**
 * True when a note has nothing in it yet.
 *
 * Used to decide which way a note opens: there is nothing to read in an empty one, so it opens
 * ready to type, and everything else opens as something to read. A brand new note is an empty
 * string before BlockNote has ever saved it, and one paragraph with no runs afterwards — both
 * are the same "nothing here", so both have to answer true.
 */
export function isEmptyDocument(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) {
    return true
  }
  if (!isBlockNoteContent(trimmed)) {
    // A legacy plain-text note, which by definition has text in it.
    return false
  }
  try {
    const blocks = JSON.parse(trimmed) as StoredBlock[]
    return blocks.every(isBlankBlock)
  } catch {
    return true
  }
}

/**
 * Builds the blocks BlockNote should start from. New notes already store BlockNote JSON and
 * pass straight through; notes written before this migration are plain text with inline
 * markers (see taskContentBlocks.ts) and get converted once, in place — the very next edit
 * persists the real JSON, so this only ever runs against the original legacy string.
 */
export function buildInitialBlocks(content: string, attachments: Attachment[], subtasks: Subtask[]): StoredBlock[] {
  if (isBlockNoteContent(content)) {
    const parsed = JSON.parse(content) as StoredBlock[]
    return parsed.length > 0 ? withShownImages(parsed) : EMPTY_DOCUMENT
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

/**
 * Flips a checklist item's `checked` prop in stored content, addressed by the block id the DOM
 * carries — for read-only renderings (a folder-grid card) that show the document without a live
 * editor to call `updateBlock` on.
 *
 * Returns null when the tick can't be recorded: a legacy plain-text note (whose blocks are
 * synthesized on read and have no stable ids), an id that no longer exists, or a block that is no
 * longer a checklist item. Callers must treat null as "not saved" rather than assuming success —
 * a checkbox that appears to tick and then silently forgets is worse than one that doesn't move.
 */
export function setBlockChecked(content: string, blockId: string, checked: boolean): string | null {
  if (!isBlockNoteContent(content)) {
    return null
  }

  let changed = false
  const walk = (list: StoredBlock[]): StoredBlock[] =>
    list.map((block) => {
      if (block.id === blockId && block.type === 'checkListItem') {
        changed = true
        return { ...block, props: { ...block.props, checked } }
      }
      return block.children ? { ...block, children: walk(block.children) } : block
    })

  const next = walk(JSON.parse(content) as StoredBlock[])
  return changed ? JSON.stringify(next) : null
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

/** Every image/file block dropped, at any depth, the rest of the document untouched. */
function withoutAttachmentBlocks(blocks: StoredBlock[]): StoredBlock[] {
  return blocks
    .filter((block) => block.type !== 'image' && block.type !== 'file')
    .map((block) =>
      block.children && block.children.length > 0
        ? { ...block, children: withoutAttachmentBlocks(block.children) }
        : block,
    )
}

/**
 * A task's content, ready to become a *different* task's.
 *
 * Two things a straight copy of the `content` column would get wrong, for opposite reasons.
 * Attachments are real files scoped to the original task by their storage path — carrying an
 * `attachment://<id>` block over verbatim would point the duplicate at somebody else's file
 * (deleting the original's attachment would silently break the copy's), and actually cloning the
 * file is a real storage operation this does not attempt, so the block is dropped instead of
 * copied halfway. Subtasks need no equivalent care despite also being their own database rows:
 * `buildInitialBlocks` already resolves them into plain inline checklist blocks with no reference
 * back to a Subtask row, which is what running any content through it — legacy plain text with
 * markers, or a note already saved as BlockNote's own JSON — does regardless of which format it
 * started in. There is nothing left in the output for a duplicate to dangle a reference from.
 */
export function contentForDuplicate(
  content: string,
  attachments: Attachment[],
  subtasks: Subtask[],
): string {
  const blocks = withoutAttachmentBlocks(buildInitialBlocks(content, attachments, subtasks))
  return JSON.stringify(blocks.length > 0 ? blocks : EMPTY_DOCUMENT)
}

