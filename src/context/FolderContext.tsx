import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  buildFolderForest,
  getChildFolders as getChildFoldersFromState,
  getFolderById,
  getFolderPath,
  nextFolderSortOrder,
  reorderSiblingFolders as applySiblingReorder,
} from '../lib/folders'
import type { Attachment, Folder, FolderNode, Subtask, Task } from '../types'
import { getTaskById, getTasksByFolder, nextTaskSortOrder, reorderSiblingTasks as applyTaskReorder } from '../lib/tasks'
import { getSubtasksByTask } from '../lib/subtasks'
import { getAttachmentsByTask } from '../lib/attachments'
import {
  beginExclusiveAction,
  cloneSnapshot,
  endExclusiveAction,
  notesFingerprint,
  rollbackNotesOnSaveFailure,
  shouldApplySessionResult,
  snapshotFromParts,
} from '../lib/persistGuard'
import { getAttachmentRepository, getNotesRepository, RepositoryError, type MaybePromise, type UiState } from '../repositories'
import { persistUiState, normalizeUiState } from '../repositories/supabase/uiStateStore'
import { detectDocumentType, isAcceptedImageFile, isAcceptedPdfFile } from '../services/attachments'
import { NotesDeletionService } from '../services/deletion/notesDeletionService'
import { ItemDndProvider } from './ItemDndContext'
import { useAuth } from './AuthContext'
import { Button } from '../components/ui/Button'

interface FolderContextValue {
  folders: Folder[]
  tasks: Task[]
  subtasks: Subtask[]
  uiState: UiState
  getFolder: (id: string) => Folder | undefined
  getChildFolders: (parentId: string | null) => Folder[]
  getPath: (id: string) => Folder[]
  getForest: () => FolderNode[]
  createFolder: (name: string, parentId: string | null) => Promise<Folder>
  renameFolder: (folderId: string, name: string) => Promise<void>
  deleteFolder: (folderId: string) => Promise<{
    parentId: string | null
    deletedFolderIds: string[]
    deletedTaskIds: string[]
  }>
  reorderSiblingFolders: (
    draggedId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => void
  toggleFolderImportant: (folderId: string) => void
  getTask: (id: string) => Task | undefined
  getTasksInFolder: (folderId: string) => Task[]
  createTask: (title: string, folderId: string) => Promise<Task>
  reorderSiblingTasks: (
    draggedId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => void
  updateTaskContent: (taskId: string, content: string) => void
  updateTaskTitle: (taskId: string, title: string) => void
  deleteTask: (taskId: string) => Promise<{ folderId: string; deletedTaskIds: string[] }>
  toggleTaskImportant: (taskId: string) => void
  getSubtasksForTask: (taskId: string) => Subtask[]
  createSubtask: (
    title: string,
    taskId: string,
    parentSubtaskId: string | null,
  ) => Promise<Subtask>
  updateSubtaskTitle: (subtaskId: string, title: string) => void
  deleteSubtask: (subtaskId: string) => Promise<void>
  toggleSubtaskCompleted: (subtaskId: string) => void
  toggleMyNotesSidebar: () => void
  toggleFolderExpanded: (folderId: string) => void
  isFolderExpanded: (folderId: string) => boolean
  toggleTaskExpanded: (taskId: string) => void
  isTaskExpanded: (taskId: string) => boolean
  toggleSubtaskExpanded: (subtaskId: string) => void
  expandSubtask: (subtaskId: string) => void
  isSubtaskExpanded: (subtaskId: string) => boolean
  getAttachmentsForTask: (taskId: string) => Attachment[]
  addImageAttachment: (taskId: string, file: File) => void
  addPdfAttachment: (taskId: string, file: File) => void
  addDocumentAttachment: (taskId: string, file: File) => void
  deleteAttachment: (attachmentId: string) => Promise<void>
  getAttachmentFile: (attachmentId: string) => MaybePromise<File | null>
  toggleAttachmentExpanded: (attachmentId: string) => void
  isAttachmentExpanded: (attachmentId: string) => boolean
  persistError: string | null
  isBusy: boolean
  saveStatus: 'idle' | 'saving' | 'saved'
  retryPersist: () => Promise<void>
  isUploadingAttachment: boolean
  removingAttachmentId: string | null
}

const FolderContext = createContext<FolderContextValue | null>(null)
const CONTENT_SAVE_DELAY_MS = 400

function createId(): string {
  return crypto.randomUUID()
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

function addId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id]
}

function removeId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id)
}

const EMPTY_UI_STATE: UiState = {
  myNotesSidebarExpanded: true,
  expandedFolderIds: [],
  expandedTaskIds: [],
  expandedSubtaskIds: [],
  collapsedSubtaskIds: [],
}

export function FolderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const notesRepository = getNotesRepository()
  const attachmentRepository = getAttachmentRepository()
  const deletionService = useMemo(
    () => new NotesDeletionService(notesRepository, attachmentRepository),
    [attachmentRepository, notesRepository],
  )
  const [folders, setFolders] = useState<Folder[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [uiState, setUiState] = useState<UiState>(EMPTY_UI_STATE)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadGeneration, setLoadGeneration] = useState(0)
  const [persistError, setPersistError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [canRetry, setCanRetry] = useState(false)
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null)
  const foldersRef = useRef(folders)
  const tasksRef = useRef(tasks)
  const subtasksRef = useRef(subtasks)
  const uiStateRef = useRef(uiState)
  const userIdRef = useRef(userId)
  const lastConfirmedRef = useRef(snapshotFromParts([], [], [], EMPTY_UI_STATE))
  const pendingRetryRef = useRef<ReturnType<typeof cloneSnapshot> | null>(null)
  const persistInflightRef = useRef<Promise<void> | null>(null)
  const persistAgainRef = useRef(false)
  const contentTimerRef = useRef<number | null>(null)
  const actionLocksRef = useRef(new Set<string>())
  foldersRef.current = folders
  tasksRef.current = tasks
  subtasksRef.current = subtasks
  uiStateRef.current = uiState
  userIdRef.current = userId

  const applyNotes = useCallback((next: { folders: Folder[]; tasks: Task[]; subtasks: Subtask[] }) => {
    foldersRef.current = next.folders
    tasksRef.current = next.tasks
    subtasksRef.current = next.subtasks
    setFolders(next.folders)
    setTasks(next.tasks)
    setSubtasks(next.subtasks)
  }, [])

  const persistNotes = useCallback(async () => {
    if (contentTimerRef.current !== null) {
      window.clearTimeout(contentTimerRef.current)
      contentTimerRef.current = null
    }
    persistAgainRef.current = true
    const inflight = persistInflightRef.current
    if (inflight) {
      await inflight
      if (
        notesFingerprint({
          folders: foldersRef.current,
          tasks: tasksRef.current,
          subtasks: subtasksRef.current,
        }) === notesFingerprint(lastConfirmedRef.current)
      ) {
        return
      }
      if (persistInflightRef.current && persistInflightRef.current !== inflight) {
        await persistNotes()
        return
      }
    }

    const run = (async () => {
      setIsBusy(true)
      try {
        while (persistAgainRef.current) {
          persistAgainRef.current = false
          const requestUserId = userIdRef.current
          if (!requestUserId) {
            throw new RepositoryError('You need to be signed in.')
          }
          const attempted = snapshotFromParts(
            foldersRef.current,
            tasksRef.current,
            subtasksRef.current,
            uiStateRef.current,
          )
          if (notesFingerprint(attempted) === notesFingerprint(lastConfirmedRef.current)) {
            continue
          }
          setSaveStatus('saving')
          try {
            await Promise.resolve(notesRepository.save(attempted))
            if (
              !shouldApplySessionResult({
                cancelled: false,
                requestUserId,
                currentUserId: userIdRef.current,
              })
            ) {
              return
            }
            lastConfirmedRef.current = cloneSnapshot(attempted)
            pendingRetryRef.current = null
            setCanRetry(false)
            setPersistError(null)
            setSaveStatus('saved')
          } catch (error: unknown) {
            if (
              !shouldApplySessionResult({
                cancelled: false,
                requestUserId,
                currentUserId: userIdRef.current,
              })
            ) {
              return
            }
            const outcome = rollbackNotesOnSaveFailure({
              lastConfirmed: lastConfirmedRef.current,
              attempted,
            })
            pendingRetryRef.current = outcome.pendingRetry
            applyNotes(outcome.restored)
            setCanRetry(true)
            setSaveStatus('idle')
            setPersistError(error instanceof RepositoryError ? error.message : 'Could not save notes.')
            throw error instanceof RepositoryError ? error : new RepositoryError('Could not save notes.')
          }
        }
      } finally {
        persistInflightRef.current = null
        setIsBusy(false)
      }
    })()

    persistInflightRef.current = run
    await run
  }, [applyNotes, notesRepository])

  const scheduleContentPersist = useCallback(() => {
    if (contentTimerRef.current !== null) {
      window.clearTimeout(contentTimerRef.current)
    }
    contentTimerRef.current = window.setTimeout(() => {
      contentTimerRef.current = null
      void persistNotes().catch(() => {
        /* persistError is set */
      })
    }, CONTENT_SAVE_DELAY_MS)
  }, [persistNotes])

  useEffect(() => {
    if (!userId) {
      setReady(false)
      setLoadError(null)
      setPersistError(null)
      setCanRetry(false)
      setSaveStatus('idle')
      pendingRetryRef.current = null
      applyNotes({ folders: [], tasks: [], subtasks: [] })
      setAttachments([])
      setExpandedAttachmentIds([])
      setUiState(EMPTY_UI_STATE)
      lastConfirmedRef.current = snapshotFromParts([], [], [], EMPTY_UI_STATE)
      attachmentRepository.clearCache()
      return
    }

    let cancelled = false
    const requestUserId = userId
    setReady(false)
    setLoadError(null)
    void Promise.resolve(notesRepository.load())
      .then((loaded) => {
        if (
          !shouldApplySessionResult({
            cancelled,
            requestUserId,
            currentUserId: userIdRef.current,
          })
        ) {
          return
        }
        applyNotes(loaded)
        setUiState(normalizeUiState(loaded.uiState))
        lastConfirmedRef.current = cloneSnapshot(loaded)
        pendingRetryRef.current = null
        setCanRetry(false)
        setPersistError(null)
        setSaveStatus('idle')
        setReady(true)
      })
      .catch((error: unknown) => {
        if (
          !shouldApplySessionResult({
            cancelled,
            requestUserId,
            currentUserId: userIdRef.current,
          })
        ) {
          return
        }
        setLoadError(error instanceof RepositoryError ? error.message : 'Could not load notes.')
      })
    return () => {
      cancelled = true
    }
  }, [applyNotes, attachmentRepository, loadGeneration, notesRepository, userId])

  useEffect(() => {
    if (!userId) {
      return
    }
    let cancelled = false
    const requestUserId = userId
    void Promise.resolve(attachmentRepository.listAttachments())
      .then((items) => {
        if (
          !shouldApplySessionResult({
            cancelled,
            requestUserId,
            currentUserId: userIdRef.current,
          })
        ) {
          return
        }
        setAttachments(items)
      })
      .catch((error: unknown) => {
        if (
          !shouldApplySessionResult({
            cancelled,
            requestUserId,
            currentUserId: userIdRef.current,
          })
        ) {
          return
        }
        setPersistError(error instanceof RepositoryError ? error.message : 'Could not load attachments.')
      })
    return () => {
      cancelled = true
    }
  }, [attachmentRepository, userId])

  useEffect(() => {
    if (!userId || !ready) {
      return
    }
    try {
      persistUiState(uiState, userId)
    } catch {
      /* local expand flags only */
    }
  }, [ready, uiState, userId])

  const retryPersist = useCallback(async () => {
    const pending = pendingRetryRef.current
    if (!pending) {
      return
    }
    applyNotes(pending)
    setUiState(pending.uiState)
    pendingRetryRef.current = null
    setCanRetry(false)
    await persistNotes()
  }, [applyNotes, persistNotes])

  const getFolder = useCallback((id: string) => getFolderById(folders, id), [folders])

  const getChildFolders = useCallback(
    (parentId: string | null) => getChildFoldersFromState(folders, parentId),
    [folders],
  )

  const getPath = useCallback((id: string) => getFolderPath(folders, id), [folders])

  const getForest = useCallback(() => buildFolderForest(folders), [folders])

  const createFolder = useCallback(
    async (name: string, parentId: string | null): Promise<Folder> => {
      if (!beginExclusiveAction(actionLocksRef.current, 'create-folder')) {
        throw new RepositoryError('Please wait for the current folder to be created.')
      }
      const folder: Folder = {
        id: createId(),
        name: name.trim(),
        parentId,
        isImportant: false,
        sortOrder: nextFolderSortOrder(foldersRef.current, parentId),
      }
      try {
        applyNotes({
          folders: [...foldersRef.current, folder],
          tasks: tasksRef.current,
          subtasks: subtasksRef.current,
        })
        if (parentId) {
          setUiState((current) => ({
            ...current,
            expandedFolderIds: addId(current.expandedFolderIds, parentId),
          }))
        }
        await persistNotes()
        return folder
      } finally {
        endExclusiveAction(actionLocksRef.current, 'create-folder')
      }
    },
    [applyNotes, persistNotes],
  )

  const renameFolder = useCallback(
    async (folderId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) {
        throw new RepositoryError('Could not rename the folder.')
      }
      if (!beginExclusiveAction(actionLocksRef.current, `rename-folder:${folderId}`)) {
        throw new RepositoryError('Please wait for the current folder to be renamed.')
      }
      try {
        const exists = foldersRef.current.some((folder) => folder.id === folderId)
        if (!exists) {
          throw new RepositoryError('Could not rename the folder.')
        }
        applyNotes({
          folders: foldersRef.current.map((folder) =>
            folder.id === folderId ? { ...folder, name: trimmed } : folder,
          ),
          tasks: tasksRef.current,
          subtasks: subtasksRef.current,
        })
        await persistNotes()
      } catch (error: unknown) {
        const message = error instanceof RepositoryError ? error.message : 'Could not rename the folder.'
        setPersistError(message)
        throw error instanceof RepositoryError ? error : new RepositoryError(message)
      } finally {
        endExclusiveAction(actionLocksRef.current, `rename-folder:${folderId}`)
      }
    },
    [applyNotes, persistNotes],
  )

  const deleteFolder = useCallback(
    async (folderId: string) => {
      if (!beginExclusiveAction(actionLocksRef.current, `delete-folder:${folderId}`)) {
        throw new RepositoryError('Please wait for the current delete to finish.')
      }
      try {
        await persistNotes()
        const result = await deletionService.deleteFolder(
          folderId,
          foldersRef.current,
          tasksRef.current,
        )
        const folderIds = new Set(result.deletedFolderIds)
        const taskIds = new Set(result.deletedTaskIds)
        const next = {
          folders: foldersRef.current.filter((folder) => !folderIds.has(folder.id)),
          tasks: tasksRef.current.filter((task) => !taskIds.has(task.id)),
          subtasks: subtasksRef.current.filter((subtask) => !taskIds.has(subtask.taskId)),
        }
        applyNotes(next)
        setAttachments((current) => current.filter((item) => !taskIds.has(item.taskId)))
        lastConfirmedRef.current = snapshotFromParts(
          next.folders,
          next.tasks,
          next.subtasks,
          uiStateRef.current,
        )
        return result
      } catch (error: unknown) {
        const message = error instanceof RepositoryError ? error.message : 'Could not delete the folder.'
        setPersistError(message)
        throw error instanceof RepositoryError ? error : new RepositoryError(message)
      } finally {
        endExclusiveAction(actionLocksRef.current, `delete-folder:${folderId}`)
      }
    },
    [applyNotes, deletionService, persistNotes],
  )

  const reorderSiblingFolders = useCallback(
    (draggedId: string, targetId: string, position: 'before' | 'after') => {
      applyNotes({
        folders: applySiblingReorder(foldersRef.current, draggedId, targetId, position),
        tasks: tasksRef.current,
        subtasks: subtasksRef.current,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const getTask = useCallback((id: string) => getTaskById(tasks, id), [tasks])

  const getTasksInFolder = useCallback(
    (folderId: string) => getTasksByFolder(tasks, folderId),
    [tasks],
  )

  const createTask = useCallback(
    async (title: string, folderId: string): Promise<Task> => {
      if (!beginExclusiveAction(actionLocksRef.current, 'create-task')) {
        throw new RepositoryError('Please wait for the current task to be created.')
      }
      const task: Task = {
        id: createId(),
        title: title.trim(),
        folderId,
        content: '',
        isImportant: false,
        sortOrder: nextTaskSortOrder(tasksRef.current, folderId),
      }
      try {
        applyNotes({
          folders: foldersRef.current,
          tasks: [...tasksRef.current, task],
          subtasks: subtasksRef.current,
        })
        setUiState((current) => ({
          ...current,
          expandedTaskIds: addId(current.expandedTaskIds, task.id),
        }))
        await persistNotes()
        return task
      } finally {
        endExclusiveAction(actionLocksRef.current, 'create-task')
      }
    },
    [applyNotes, persistNotes],
  )

  const reorderSiblingTasks = useCallback(
    (draggedId: string, targetId: string, position: 'before' | 'after') => {
      applyNotes({
        folders: foldersRef.current,
        tasks: applyTaskReorder(tasksRef.current, draggedId, targetId, position),
        subtasks: subtasksRef.current,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const updateTaskContent = useCallback(
    (taskId: string, content: string) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) => (task.id === taskId ? { ...task, content } : task)),
        subtasks: subtasksRef.current,
      })
      scheduleContentPersist()
    },
    [applyNotes, scheduleContentPersist],
  )

  const updateTaskTitle = useCallback(
    (taskId: string, title: string) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) => (task.id === taskId ? { ...task, title } : task)),
        subtasks: subtasksRef.current,
      })
      scheduleContentPersist()
    },
    [applyNotes, scheduleContentPersist],
  )

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!beginExclusiveAction(actionLocksRef.current, `delete-task:${taskId}`)) {
        throw new RepositoryError('Please wait for the current delete to finish.')
      }
      try {
        await persistNotes()
        const result = await deletionService.deleteTask(taskId, tasksRef.current)
        const taskIds = new Set(result.deletedTaskIds)
        const next = {
          folders: foldersRef.current,
          tasks: tasksRef.current.filter((task) => !taskIds.has(task.id)),
          subtasks: subtasksRef.current.filter((subtask) => !taskIds.has(subtask.taskId)),
        }
        applyNotes(next)
        setAttachments((current) => current.filter((item) => !taskIds.has(item.taskId)))
        lastConfirmedRef.current = snapshotFromParts(
          next.folders,
          next.tasks,
          next.subtasks,
          uiStateRef.current,
        )
        return result
      } catch (error: unknown) {
        const message = error instanceof RepositoryError ? error.message : 'Could not delete the task.'
        setPersistError(message)
        throw error instanceof RepositoryError ? error : new RepositoryError(message)
      } finally {
        endExclusiveAction(actionLocksRef.current, `delete-task:${taskId}`)
      }
    },
    [applyNotes, deletionService, persistNotes],
  )

  const toggleFolderImportant = useCallback(
    (folderId: string) => {
      applyNotes({
        folders: foldersRef.current.map((folder) =>
          folder.id === folderId ? { ...folder, isImportant: !folder.isImportant } : folder,
        ),
        tasks: tasksRef.current,
        subtasks: subtasksRef.current,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const toggleTaskImportant = useCallback(
    (taskId: string) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) =>
          task.id === taskId ? { ...task, isImportant: !task.isImportant } : task,
        ),
        subtasks: subtasksRef.current,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const getSubtasksForTask = useCallback(
    (taskId: string) => getSubtasksByTask(subtasks, taskId),
    [subtasks],
  )

  const createSubtask = useCallback(
    async (title: string, taskId: string, parentSubtaskId: string | null): Promise<Subtask> => {
      if (!beginExclusiveAction(actionLocksRef.current, 'create-subtask')) {
        throw new RepositoryError('Please wait for the current subtask to be created.')
      }
      const subtask: Subtask = {
        id: createId(),
        title: title.trim(),
        taskId,
        parentSubtaskId,
        completed: false,
      }
      try {
        applyNotes({
          folders: foldersRef.current,
          tasks: tasksRef.current,
          subtasks: [...subtasksRef.current, subtask],
        })
        if (parentSubtaskId) {
          setUiState((current) => ({
            ...current,
            expandedSubtaskIds: addId(current.expandedSubtaskIds, parentSubtaskId),
            collapsedSubtaskIds: removeId(current.collapsedSubtaskIds, parentSubtaskId),
            expandedTaskIds: addId(current.expandedTaskIds, taskId),
          }))
        }
        await persistNotes()
        return subtask
      } finally {
        endExclusiveAction(actionLocksRef.current, 'create-subtask')
      }
    },
    [applyNotes, persistNotes],
  )

  const updateSubtaskTitle = useCallback(
    (subtaskId: string, title: string) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current,
        subtasks: subtasksRef.current.map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, title } : subtask,
        ),
      })
      scheduleContentPersist()
    },
    [applyNotes, scheduleContentPersist],
  )

  const deleteSubtask = useCallback(
    async (subtaskId: string) => {
      if (!beginExclusiveAction(actionLocksRef.current, `delete-subtask:${subtaskId}`)) {
        throw new RepositoryError('Please wait for the current delete to finish.')
      }
      try {
        await persistNotes()
        const removedIds = await deletionService.deleteSubtask(subtaskId, subtasksRef.current)
        const remove = new Set(removedIds)
        const next = {
          folders: foldersRef.current,
          tasks: tasksRef.current,
          subtasks: subtasksRef.current.filter((subtask) => !remove.has(subtask.id)),
        }
        applyNotes(next)
        lastConfirmedRef.current = snapshotFromParts(
          next.folders,
          next.tasks,
          next.subtasks,
          uiStateRef.current,
        )
      } catch (error: unknown) {
        const message = error instanceof RepositoryError ? error.message : 'Could not delete the subtask.'
        setPersistError(message)
        throw error instanceof RepositoryError ? error : new RepositoryError(message)
      } finally {
        endExclusiveAction(actionLocksRef.current, `delete-subtask:${subtaskId}`)
      }
    },
    [applyNotes, deletionService, persistNotes],
  )

  const toggleSubtaskCompleted = useCallback(
    (subtaskId: string) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current,
        subtasks: subtasksRef.current.map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask,
        ),
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const toggleMyNotesSidebar = useCallback(() => {
    setUiState((current) => ({
      ...current,
      myNotesSidebarExpanded: !current.myNotesSidebarExpanded,
    }))
  }, [])

  const toggleFolderExpanded = useCallback((folderId: string) => {
    setUiState((current) => ({
      ...current,
      expandedFolderIds: toggleId(current.expandedFolderIds, folderId),
    }))
  }, [])

  const isFolderExpanded = useCallback(
    (folderId: string) => uiState.expandedFolderIds.includes(folderId),
    [uiState.expandedFolderIds],
  )

  const toggleTaskExpanded = useCallback((taskId: string) => {
    setUiState((current) => ({
      ...current,
      expandedTaskIds: toggleId(current.expandedTaskIds, taskId),
    }))
  }, [])

  const isTaskExpanded = useCallback(
    (taskId: string) => uiState.expandedTaskIds.includes(taskId),
    [uiState.expandedTaskIds],
  )

  const toggleSubtaskExpanded = useCallback((subtaskId: string) => {
    setUiState((current) => ({
      ...current,
      collapsedSubtaskIds: toggleId(current.collapsedSubtaskIds, subtaskId),
    }))
  }, [])

  const expandSubtask = useCallback((subtaskId: string) => {
    setUiState((current) => ({
      ...current,
      expandedSubtaskIds: addId(current.expandedSubtaskIds, subtaskId),
      collapsedSubtaskIds: removeId(current.collapsedSubtaskIds, subtaskId),
    }))
  }, [])

  const isSubtaskExpanded = useCallback(
    (subtaskId: string) => !uiState.collapsedSubtaskIds.includes(subtaskId),
    [uiState.collapsedSubtaskIds],
  )

  const getAttachmentsForTask = useCallback(
    (taskId: string) => getAttachmentsByTask(attachments, taskId),
    [attachments],
  )

  const addPersistedAttachment = useCallback(
    (taskId: string, file: File) => {
      if (!beginExclusiveAction(actionLocksRef.current, `upload-attachment:${taskId}`)) {
        return
      }
      const requestUserId = userIdRef.current
      setIsUploadingAttachment(true)
      void Promise.resolve(attachmentRepository.createAttachment(taskId, file))
        .then((attachment) => {
          if (
            !shouldApplySessionResult({
              cancelled: false,
              requestUserId,
              currentUserId: userIdRef.current,
            })
          ) {
            return
          }
          setAttachments((current) => [...current, attachment])
          setPersistError(null)
        })
        .catch((error: unknown) => {
          if (
            !shouldApplySessionResult({
              cancelled: false,
              requestUserId,
              currentUserId: userIdRef.current,
            })
          ) {
            return
          }
          setPersistError(error instanceof RepositoryError ? error.message : 'Could not attach the file.')
        })
        .finally(() => {
          endExclusiveAction(actionLocksRef.current, `upload-attachment:${taskId}`)
          setIsUploadingAttachment(false)
        })
    },
    [attachmentRepository],
  )

  const addImageAttachment = useCallback(
    (taskId: string, file: File) => {
      if (!isAcceptedImageFile(file)) {
        return
      }
      addPersistedAttachment(taskId, file)
    },
    [addPersistedAttachment],
  )

  const addPdfAttachment = useCallback(
    (taskId: string, file: File) => {
      if (!isAcceptedPdfFile(file)) {
        return
      }
      addPersistedAttachment(taskId, file)
    },
    [addPersistedAttachment],
  )

  const addDocumentAttachment = useCallback(
    (taskId: string, file: File) => {
      if (!detectDocumentType(file)) {
        return
      }
      addPersistedAttachment(taskId, file)
    },
    [addPersistedAttachment],
  )

  const deleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!beginExclusiveAction(actionLocksRef.current, `delete-attachment:${attachmentId}`)) {
        throw new RepositoryError('Please wait for the current delete to finish.')
      }
      const requestUserId = userIdRef.current
      setRemovingAttachmentId(attachmentId)
      try {
        await Promise.resolve(attachmentRepository.deleteAttachment(attachmentId))
        if (
          !shouldApplySessionResult({
            cancelled: false,
            requestUserId,
            currentUserId: userIdRef.current,
          })
        ) {
          return
        }
        setAttachments((current) => current.filter((item) => item.id !== attachmentId))
        setPersistError(null)
      } catch (error: unknown) {
        if (
          shouldApplySessionResult({
            cancelled: false,
            requestUserId,
            currentUserId: userIdRef.current,
          })
        ) {
          setPersistError(error instanceof RepositoryError ? error.message : 'Could not delete the attachment.')
        }
        throw error instanceof RepositoryError ? error : new RepositoryError('Could not delete the attachment.')
      } finally {
        endExclusiveAction(actionLocksRef.current, `delete-attachment:${attachmentId}`)
        setRemovingAttachmentId(null)
      }
    },
    [attachmentRepository],
  )

  const getAttachmentFile = useCallback(
    (attachmentId: string) => attachmentRepository.getFile(attachmentId),
    [attachmentRepository],
  )

  const toggleAttachmentExpanded = useCallback((attachmentId: string) => {
    setExpandedAttachmentIds((current) => toggleId(current, attachmentId))
  }, [])

  const isAttachmentExpanded = useCallback(
    (attachmentId: string) => expandedAttachmentIds.includes(attachmentId),
    [expandedAttachmentIds],
  )

  const value = useMemo(
    () => ({
      folders,
      tasks,
      subtasks,
      uiState,
      getFolder,
      getChildFolders,
      getPath,
      getForest,
      createFolder,
      renameFolder,
      deleteFolder,
      reorderSiblingFolders,
      toggleFolderImportant,
      getTask,
      getTasksInFolder,
      createTask,
      reorderSiblingTasks,
      updateTaskContent,
      updateTaskTitle,
      deleteTask,
      toggleTaskImportant,
      getSubtasksForTask,
      createSubtask,
      updateSubtaskTitle,
      deleteSubtask,
      toggleSubtaskCompleted,
      toggleMyNotesSidebar,
      toggleFolderExpanded,
      isFolderExpanded,
      toggleTaskExpanded,
      isTaskExpanded,
      toggleSubtaskExpanded,
      expandSubtask,
      isSubtaskExpanded,
      getAttachmentsForTask,
      addImageAttachment,
      addPdfAttachment,
      addDocumentAttachment,
      deleteAttachment,
      getAttachmentFile,
      toggleAttachmentExpanded,
      isAttachmentExpanded,
      persistError,
      isBusy,
      saveStatus,
      retryPersist,
      isUploadingAttachment,
      removingAttachmentId,
    }),
    [
      folders,
      tasks,
      subtasks,
      uiState,
      getFolder,
      getChildFolders,
      getPath,
      getForest,
      createFolder,
      renameFolder,
      deleteFolder,
      reorderSiblingFolders,
      toggleFolderImportant,
      getTask,
      getTasksInFolder,
      createTask,
      reorderSiblingTasks,
      updateTaskContent,
      updateTaskTitle,
      deleteTask,
      toggleTaskImportant,
      getSubtasksForTask,
      createSubtask,
      updateSubtaskTitle,
      deleteSubtask,
      toggleSubtaskCompleted,
      toggleMyNotesSidebar,
      toggleFolderExpanded,
      isFolderExpanded,
      toggleTaskExpanded,
      isTaskExpanded,
      toggleSubtaskExpanded,
      expandSubtask,
      isSubtaskExpanded,
      getAttachmentsForTask,
      addImageAttachment,
      addPdfAttachment,
      addDocumentAttachment,
      deleteAttachment,
      getAttachmentFile,
      toggleAttachmentExpanded,
      isAttachmentExpanded,
      persistError,
      isBusy,
      saveStatus,
      retryPersist,
      isUploadingAttachment,
      removingAttachmentId,
    ],
  )

  if (!userId) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-surface)] text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    )
  }

  if (!ready && !loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-surface)] text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--color-surface)] px-4 text-center text-sm text-[var(--color-text-muted)]">
        <p>{loadError}</p>
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            setLoadError(null)
            setLoadGeneration((current) => current + 1)
          }}
        >
          Retry
        </Button>
      </div>
    )
  }

  return (
    <FolderContext.Provider value={value}>
      <div className="relative h-full">
        {persistError ? (
          <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm text-[var(--color-text)]">
            <span>{persistError}</span>
            {canRetry ? (
              <Button size="sm" variant="subtle" onClick={() => void retryPersist().catch(() => undefined)}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : isBusy || isUploadingAttachment || removingAttachmentId ? (
          <div className="absolute inset-x-0 top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm text-[var(--color-text-muted)]">
            Saving…
          </div>
        ) : null}
        <ItemDndProvider>{children}</ItemDndProvider>
      </div>
    </FolderContext.Provider>
  )
}

export function useFolders(): FolderContextValue {
  const context = useContext(FolderContext)
  if (!context) {
    throw new Error('useFolders must be used within a FolderProvider')
  }
  return context
}
