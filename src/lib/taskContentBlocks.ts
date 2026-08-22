// A task's `content` stays one plain string (no storage schema change), but it can carry
// inline markers so text, attachments, and checklist items can be freely interleaved in any
// order, e.g. "intro text" + marker(image) + "more text" + marker(subtask) + "more text".
// A marker wraps a kind + id in a SOH control character (code point 1) that a textarea can
// never produce, and that Postgres `text` columns happily store (unlike the NUL byte, which
// they reject).
const SENTINEL = String.fromCharCode(1)

type BlockKind = 'ATTACHMENT' | 'SUBTASK'

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function markerFor(kind: BlockKind, id: string): string {
  return `${SENTINEL}${kind}:${id}${SENTINEL}`
}

function buildMarkerPattern(): RegExp {
  const sentinel = escapeForRegExp(SENTINEL)
  return new RegExp(`${sentinel}(ATTACHMENT|SUBTASK):([^${SENTINEL}]*)${sentinel}`, 'g')
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'attachment'; attachmentId: string }
  | { type: 'subtask'; subtaskId: string }

export function parseContentBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = []
  const pattern = buildMarkerPattern()
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content))) {
    blocks.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    const [, kind, id] = match
    blocks.push(kind === 'ATTACHMENT' ? { type: 'attachment', attachmentId: id } : { type: 'subtask', subtaskId: id })
    lastIndex = match.index + match[0].length
  }
  blocks.push({ type: 'text', text: content.slice(lastIndex) })

  return blocks
}

export function serializeContentBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === 'text') {
        return block.text
      }
      if (block.type === 'attachment') {
        return markerFor('ATTACHMENT', block.attachmentId)
      }
      return markerFor('SUBTASK', block.subtaskId)
    })
    .join('')
}

export interface CursorPosition {
  blockIndex: number
  offset: number
}

/**
 * Inserts a new block at the cursor's position (splitting the text block it points into),
 * or appends it at the end when there's no usable cursor. Returns the index of the trailing
 * text block so the caller can refocus it.
 */
export function insertBlockAtCursor(
  blocks: ContentBlock[],
  newBlock: ContentBlock,
  cursor: CursorPosition | null,
): { blocks: ContentBlock[]; focusIndex: number } {
  const target = cursor ? blocks[cursor.blockIndex] : undefined

  if (cursor && target && target.type === 'text') {
    const offset = Math.max(0, Math.min(cursor.offset, target.text.length))
    const before: ContentBlock = { type: 'text', text: target.text.slice(0, offset) }
    const after: ContentBlock = { type: 'text', text: target.text.slice(offset) }
    return {
      blocks: [...blocks.slice(0, cursor.blockIndex), before, newBlock, after, ...blocks.slice(cursor.blockIndex + 1)],
      focusIndex: cursor.blockIndex + 2,
    }
  }

  const nextBlocks: ContentBlock[] = [...blocks, newBlock, { type: 'text', text: '' }]
  return { blocks: nextBlocks, focusIndex: nextBlocks.length - 1 }
}

function removeBlockMarker(content: string, kind: BlockKind, id: string): string {
  const pattern = new RegExp(`${escapeForRegExp(markerFor(kind, id))}\\n?`, 'g')
  return content.replace(pattern, '')
}

export function removeAttachmentBlock(content: string, attachmentId: string): string {
  return removeBlockMarker(content, 'ATTACHMENT', attachmentId)
}

export function removeSubtaskBlock(content: string, subtaskId: string): string {
  return removeBlockMarker(content, 'SUBTASK', subtaskId)
}
