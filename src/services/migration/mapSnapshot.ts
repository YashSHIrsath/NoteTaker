import type { Folder, Subtask, Task } from '../../types'
import type { AppSnapshot } from '../storage/types'
import { buildIdMaps, requireMappedId, type IdMaps } from './idMap'

export interface MappedNotes {
  folders: Folder[]
  tasks: Task[]
  subtasks: Subtask[]
}

export function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as AppSnapshot
}

export function mapSnapshotToUuidNotes(snapshot: AppSnapshot, maps: IdMaps): MappedNotes {
  const folders = snapshot.folders.map((folder) => ({
    id: requireMappedId(maps.folders, folder.id, 'Folder'),
    name: folder.name,
    parentId: folder.parentId === null ? null : requireMappedId(maps.folders, folder.parentId, 'Folder parent'),
    isImportant: folder.isImportant,
    sortOrder: folder.sortOrder,
  }))

  const tasks = snapshot.tasks.map((task) => ({
    id: requireMappedId(maps.tasks, task.id, 'Task'),
    title: task.title,
    folderId: requireMappedId(maps.folders, task.folderId, 'Task folder'),
    content: task.content,
    isImportant: task.isImportant,
    pinnedScopes: task.pinnedScopes,
    sortOrder: task.sortOrder,
    noteKind: task.noteKind,
    dueAt: task.dueAt,
    completed: task.completed,
    completedAt: task.completedAt,
    tags: task.tags,
    color: task.color,
    gridLayouts: task.gridLayouts,
  }))

  const subtasks = snapshot.subtasks.map((subtask) => ({
    id: requireMappedId(maps.subtasks, subtask.id, 'Subtask'),
    title: subtask.title,
    taskId: requireMappedId(maps.tasks, subtask.taskId, 'Subtask task'),
    parentSubtaskId:
      subtask.parentSubtaskId === null
        ? null
        : requireMappedId(maps.subtasks, subtask.parentSubtaskId, 'Subtask parent'),
    completed: subtask.completed,
  }))

  return { folders, tasks, subtasks }
}

export function mapsFromSnapshot(snapshot: AppSnapshot, previous?: IdMaps): IdMaps {
  return buildIdMaps(
    {
      folderIds: snapshot.folders.map((item) => item.id),
      taskIds: snapshot.tasks.map((item) => item.id),
      subtaskIds: snapshot.subtasks.map((item) => item.id),
    },
    previous,
  )
}
