export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export interface IdMaps {
  folders: Record<string, string>
  tasks: Record<string, string>
  subtasks: Record<string, string>
}

export function emptyIdMaps(): IdMaps {
  return { folders: {}, tasks: {}, subtasks: {} }
}

function assignIds(oldIds: string[], previous: Record<string, string>, createId: () => string): Record<string, string> {
  const next: Record<string, string> = { ...previous }
  for (const oldId of oldIds) {
    if (!next[oldId]) {
      next[oldId] = isUuid(oldId) ? oldId : createId()
    }
  }
  return next
}

export function buildIdMaps(
  input: { folderIds: string[]; taskIds: string[]; subtaskIds: string[] },
  previous: IdMaps = emptyIdMaps(),
  createId: () => string = () => crypto.randomUUID(),
): IdMaps {
  return {
    folders: assignIds(input.folderIds, previous.folders, createId),
    tasks: assignIds(input.taskIds, previous.tasks, createId),
    subtasks: assignIds(input.subtaskIds, previous.subtasks, createId),
  }
}

export function requireMappedId(map: Record<string, string>, oldId: string, label: string): string {
  const mapped = map[oldId]
  if (!mapped) {
    throw new Error(`${label} is missing from the ID map.`)
  }
  if (!isUuid(mapped)) {
    throw new Error(`${label} mapped to an invalid UUID.`)
  }
  return mapped
}
