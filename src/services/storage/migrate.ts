import { isTaskColor } from '../../lib/taskColor'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function withImportantFlag(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  return {
    ...value,
    isImportant: typeof value.isImportant === 'boolean' ? value.isImportant : false,
  }
}

function withFolderSiblingSortOrder(folders: unknown): unknown {
  if (!Array.isArray(folders)) {
    return folders
  }

  const nextIndexByParent = new Map<string, number>()

  return folders.map((folder) => {
    if (!isRecord(folder)) {
      return folder
    }

    const parentKey = folder.parentId === null ? '__root__' : String(folder.parentId)
    const index = nextIndexByParent.get(parentKey) ?? 0
    nextIndexByParent.set(parentKey, index + 1)

    return {
      ...folder,
      sortOrder: typeof folder.sortOrder === 'number' ? folder.sortOrder : index,
    }
  })
}

function migrateV1ToV2(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    version: 2,
    folders: Array.isArray(value.folders) ? value.folders.map(withImportantFlag) : value.folders,
    tasks: Array.isArray(value.tasks) ? value.tasks.map(withImportantFlag) : value.tasks,
  }
}

function migrateV2ToV3(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    version: 3,
    folders: withFolderSiblingSortOrder(value.folders),
  }
}

function withTaskSiblingSortOrder(tasks: unknown): unknown {
  if (!Array.isArray(tasks)) {
    return tasks
  }

  const nextIndexByFolder = new Map<string, number>()

  return tasks.map((task) => {
    if (!isRecord(task)) {
      return task
    }

    const folderKey = String(task.folderId)
    const index = nextIndexByFolder.get(folderKey) ?? 0
    nextIndexByFolder.set(folderKey, index + 1)

    return {
      ...task,
      sortOrder: typeof task.sortOrder === 'number' ? task.sortOrder : index,
    }
  })
}

function migrateV3ToV4(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    version: 4,
    tasks: withTaskSiblingSortOrder(value.tasks),
  }
}

function withPinnedFlag(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  return {
    ...value,
    isPinned: typeof value.isPinned === 'boolean' ? value.isPinned : false,
  }
}

function migrateV4ToV5(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    version: 5,
    tasks: Array.isArray(value.tasks) ? value.tasks.map(withPinnedFlag) : value.tasks,
  }
}

function withDueDateFields(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  return {
    ...value,
    dueAt: typeof value.dueAt === 'string' ? value.dueAt : null,
    remindBeforeMinutes: typeof value.remindBeforeMinutes === 'number' ? value.remindBeforeMinutes : null,
  }
}

function migrateV5ToV6(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    version: 6,
    tasks: Array.isArray(value.tasks) ? value.tasks.map(withDueDateFields) : value.tasks,
  }
}

const TASK_STATUSES = new Set(['pending', 'ongoing', 'complete'])

function withStatusField(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  return {
    ...value,
    status: typeof value.status === 'string' && TASK_STATUSES.has(value.status) ? value.status : null,
  }
}

function migrateV6ToV7(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    version: 7,
    tasks: Array.isArray(value.tasks) ? value.tasks.map(withStatusField) : value.tasks,
  }
}

function withTagsField(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  return {
    ...value,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  }
}

function migrateV7ToV8(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    version: 8,
    tasks: Array.isArray(value.tasks) ? value.tasks.map(withTagsField) : value.tasks,
  }
}

function withColorField(value: unknown): unknown {
  if (!isRecord(value)) {
    return value
  }
  return {
    ...value,
    // null, not a palette entry: an existing task keeps deriving its color from its view, which
    // is what it looked like before the picker existed.
    color: isTaskColor(value.color) ? value.color : null,
  }
}

function migrateV8ToV9(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    version: 9,
    tasks: Array.isArray(value.tasks) ? value.tasks.map(withColorField) : value.tasks,
  }
}

/**
 * The tag catalogue arrives, seeded from the names already written on tasks.
 *
 * Every distinct name across every task becomes a tag, matched case-insensitively so "job" and
 * "Job" collapse into the one that was written first. Tasks keep their names untouched — they
 * reference the catalogue by name, and the names they already have are exactly the ones just
 * put in it.
 */
function migrateV9ToV10(value: Record<string, unknown>): Record<string, unknown> {
  const byKey = new Map<string, { id: string; name: string }>()
  if (Array.isArray(value.tasks)) {
    for (const task of value.tasks) {
      if (!isRecord(task) || !Array.isArray(task.tags)) {
        continue
      }
      for (const raw of task.tags) {
        if (typeof raw !== 'string') {
          continue
        }
        const name = raw.trim()
        const key = name.toLowerCase()
        if (name && !byKey.has(key)) {
          byKey.set(key, { id: crypto.randomUUID(), name })
        }
      }
    }
  }
  return {
    ...value,
    version: 10,
    tags: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** Brings stored snapshots up to the current schema without dropping user data. */
export function migrateSnapshot(value: unknown): unknown {
  if (!isRecord(value) || typeof value.version !== 'number') {
    return value
  }

  let current: Record<string, unknown> = value

  if (current.version === 1) {
    current = migrateV1ToV2(current)
  }
  if (current.version === 2) {
    current = migrateV2ToV3(current)
  }
  if (current.version === 3) {
    current = migrateV3ToV4(current)
  }
  if (current.version === 4) {
    current = migrateV4ToV5(current)
  }
  if (current.version === 5) {
    current = migrateV5ToV6(current)
  }
  if (current.version === 6) {
    current = migrateV6ToV7(current)
  }
  if (current.version === 7) {
    current = migrateV7ToV8(current)
  }
  if (current.version === 8) {
    current = migrateV8ToV9(current)
  }
  if (current.version === 9) {
    current = migrateV9ToV10(current)
  }

  return current
}
