/**
 * What a person was doing, in a sentence.
 *
 * The activity record is written by database triggers reading OLD and NEW, so this is never the
 * account of what happened — the diff is. This only decides how the line reads: "Moved a note to
 * another folder" instead of a `folder_id` that changed. If one of these were ever wrong, the real
 * before and after would be sitting beside it.
 *
 * Kept as one list rather than strings at each call site so the feed reads consistently, and so
 * rephrasing one is a single edit rather than a hunt.
 */
export const WRITE_INTENT = {
  folderCreated: 'Created a folder',
  folderRenamed: 'Renamed a folder',
  folderDeleted: 'Deleted a folder',
  foldersReordered: 'Reordered folders',
  folderStarred: 'Starred a folder',
  folderUnstarred: 'Unstarred a folder',

  taskCreated: 'Created a note',
  tasksReordered: 'Reordered notes',
  taskMoved: 'Moved a note to another folder',
  taskEdited: 'Edited a note',
  boardRearranged: 'Rearranged the board',
  taskRenamed: 'Renamed a note',
  taskDeleted: 'Deleted a note',
  taskStarred: 'Starred a note',
  taskUnstarred: 'Unstarred a note',
  taskPinned: 'Pinned a note',
  taskUnpinned: 'Unpinned a note',
  scheduleChanged: 'Changed a deadline',
  taskCompleted: 'Marked a note done',
  taskReopened: 'Reopened a note',
  tagsChanged: 'Changed the tags on a note',
  colourChanged: 'Changed a note colour',
  tagDeleted: 'Deleted a tag',

  subtaskCreated: 'Added a checklist item',
  subtaskRenamed: 'Renamed a checklist item',
  subtaskDeleted: 'Deleted a checklist item',
  subtaskCompleted: 'Ticked a checklist item',
  subtaskReopened: 'Unticked a checklist item',
} as const

export type WriteIntent = (typeof WRITE_INTENT)[keyof typeof WRITE_INTENT]

/**
 * Everything one flush was doing, as a single sentence.
 *
 * A flush can carry several actions — you tick a box, rename the note, and the debounce sends both.
 * Joining them truthfully is better than picking one and implying it was the only thing: the intent
 * is meant to describe the batch, and the per-row diffs say which part of it touched which row.
 * Repeats collapse, because forty keystrokes are one edit.
 */
export function summariseIntents(intents: readonly string[]): string | undefined {
  const seen: string[] = []
  for (const intent of intents) {
    const value = intent.trim()
    if (value && !seen.includes(value)) {
      seen.push(value)
    }
  }
  return seen.length === 0 ? undefined : seen.join('; ')
}
