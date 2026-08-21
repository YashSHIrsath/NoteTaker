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

  return current
}
