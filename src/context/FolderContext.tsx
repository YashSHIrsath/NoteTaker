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
import type {
  Attachment,
  Folder,
  FolderNode,
  NoteKind,
  Reminder,
  ReminderDraft,
  Subtask,
  Tag,
  Task,
  TaskColor,
  TaskGridPlacement,
  TaskGridScope,
} from '../types'
import { getTaskById, getTasksByFolder, nextTaskSortOrder, reorderSiblingTasks as applyTaskReorder } from '../lib/tasks'
import { getSubtasksByTask } from '../lib/subtasks'
import { PLACEMENT_VERSION, placementForScope, samePlacement } from '../lib/taskGrid'
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
import {
  getAttachmentRepository,
  getNotesRepository,
  getRemindersRepository,
  RepositoryError,
  type MaybePromise,
  type UiState,
} from '../repositories'
import { normalizeDraft } from '../lib/reminders'
import { syncServerClock } from '../lib/serverClock'
import { persistUiState, normalizeUiState } from '../repositories/supabase/uiStateStore'
import { detectDocumentType, isAcceptedImageFile, isAcceptedPdfFile } from '../services/attachments'
import { NotesDeletionService } from '../services/deletion/notesDeletionService'
import { ItemDndProvider } from './ItemDndContext'
import { useAuth } from './AuthContext'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { LoadingSplash } from '../components/common/LoadingSplash'

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
  moveTaskToFolder: (taskId: string, targetFolderId: string) => void
  /** `immediate` skips the typing debounce — for a discrete edit (ticking a checklist item from a
   *  card) where there is no next keystroke to wait for. */
  updateTaskContent: (taskId: string, content: string, options?: { immediate?: boolean }) => void
  /** Writes new grid positions/sizes for a set of cards in one go — a drag moves neighbours too,
   *  so this takes the whole changed set rather than one card at a time. */
  /**
   * `scope` is the listing the gesture happened in; only that listing's arrangement changes, and
   * within it only the fields given — a drag writes an order and leaves the size alone, a resize
   * writes a size and leaves the order alone.
   */
  updateTaskLayouts: (
    scope: TaskGridScope,
    entries: Array<{ taskId: string; placement: Partial<TaskGridPlacement> }>,
  ) => void
  updateTaskTitle: (taskId: string, title: string) => void
  deleteTask: (taskId: string) => Promise<{ folderId: string; deletedTaskIds: string[] }>
  toggleTaskImportant: (taskId: string) => void
  toggleTaskPinned: (taskId: string) => void
  /**
   * The note/task switch and the deadline, written together.
   *
   * One call rather than two because they are one invariant: a plain note has no due date, and the
   * database normalises any row that claims otherwise. Setting them separately would mean a moment
   * where local state and the server disagree about what the note even is.
   */
  updateTaskSchedule: (taskId: string, noteKind: NoteKind, dueAt: string | null) => void
  /** Tick or untick. The *time* of the tick is the server's to write, not ours — see Task.completedAt. */
  setTaskCompleted: (taskId: string, completed: boolean) => void
  /** This task's reminders, newest last. Empty for a note that has none. */
  getRemindersForTask: (taskId: string) => Reminder[]
  addReminder: (taskId: string, draft: ReminderDraft) => Promise<void>
  updateReminder: (reminderId: string, taskId: string, draft: ReminderDraft) => Promise<void>
  setReminderActive: (reminderId: string, isActive: boolean) => Promise<void>
  deleteReminder: (reminderId: string) => Promise<void>
  /** Re-reads every reminder from the server. The scheduler writes last_run_at and next_run_at
   *  from outside this app entirely, so a reminder that fires while a page is open only becomes
   *  visible by asking again. */
  refreshReminders: () => Promise<void>
  /** Set when a reminder write fails, so the dialog can say so instead of silently no-opping. */
  reminderError: string | null
  updateTaskTags: (taskId: string, tags: string[]) => void
  /** Every tag this account has, name-sorted — what the tag picker offers instead of retyping. */
  tags: Tag[]
  /** Removes a tag from the catalogue and from every task that carries it. */
  deleteTag: (tagId: string) => void
  updateTaskColor: (taskId: string, color: TaskColor | null) => void
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
  getAttachmentPreviewUrl: (attachmentId: string) => Promise<string | null>
  addImageAttachment: (taskId: string, file: File) => Promise<Attachment | null>
  addPdfAttachment: (taskId: string, file: File) => Promise<Attachment | null>
  addDocumentAttachment: (taskId: string, file: File) => Promise<Attachment | null>
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
  const remindersRepository = getRemindersRepository()
  const deletionService = useMemo(
    () => new NotesDeletionService(notesRepository, attachmentRepository),
    [attachmentRepository, notesRepository],
  )
  const [folders, setFolders] = useState<Folder[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [tags, setTags] = useState<Tag[]>([])
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
  const tagsRef = useRef(tags)
  const uiStateRef = useRef(uiState)
  const userIdRef = useRef(userId)
  const lastConfirmedRef = useRef(snapshotFromParts([], [], [], [], EMPTY_UI_STATE))
  const pendingRetryRef = useRef<ReturnType<typeof cloneSnapshot> | null>(null)
  const persistInflightRef = useRef<Promise<void> | null>(null)
  const persistAgainRef = useRef(false)
  const contentTimerRef = useRef<number | null>(null)
  const actionLocksRef = useRef(new Set<string>())
  foldersRef.current = folders
  tasksRef.current = tasks
  subtasksRef.current = subtasks
  tagsRef.current = tags
  uiStateRef.current = uiState
  userIdRef.current = userId

  const applyNotes = useCallback(
    (next: { folders: Folder[]; tasks: Task[]; subtasks: Subtask[]; tags?: Tag[] }) => {
      foldersRef.current = next.folders
      tasksRef.current = next.tasks
      subtasksRef.current = next.subtasks
      setFolders(next.folders)
      setTasks(next.tasks)
      setSubtasks(next.subtasks)
      // Optional: most edits don't touch the catalogue, and every caller that doesn't should not
      // have to pass the current one back in just to leave it alone.
      if (next.tags) {
        tagsRef.current = next.tags
        setTags(next.tags)
      }
    },
    [],
  )

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
          tags: tagsRef.current,
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
            tagsRef.current,
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
      applyNotes({ folders: [], tasks: [], subtasks: [], tags: [] })
      setAttachments([])
      setExpandedAttachmentIds([])
      setUiState(EMPTY_UI_STATE)
      lastConfirmedRef.current = snapshotFromParts([], [], [], [], EMPTY_UI_STATE)
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

  /**
   * Reminders and the clock, loaded once per session alongside the notes.
   *
   * Read in one go rather than per task: an account has a handful of reminders, and fetching them
   * when a note opens would mean the card grid couldn't show a bell on a note without asking the
   * server about every note on screen.
   *
   * The clock sync rides along here because it is needed for the same reason and at the same
   * moment — every countdown and every overdue decision measures against server time, and the
   * first paint after a load is exactly when a task that expired while the browser was closed has
   * to already look overdue.
   */
  useEffect(() => {
    if (!userId) {
      setReminders([])
      setReminderError(null)
      return
    }
    let cancelled = false
    const requestUserId = userId
    void syncServerClock()
    void Promise.resolve(remindersRepository.listAll())
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
        setReminders(items)
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
        // Not fatal to the app: notes load and edit perfectly well without their reminders, and
        // the reminder section says so rather than showing an empty list as though there were none.
        setReminderError(
          error instanceof RepositoryError ? error.message : 'Could not load reminders.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [remindersRepository, userId])

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

  // A pending typing save must not die with the page. Both events fire on a reload, a tab close
  // and a phone backgrounding the browser, and pagehide is the one that still fires on iOS, where
  // beforeunload does not. Only flushes when a save is actually pending, so this costs nothing on
  // an ordinary navigation.
  useEffect(() => {
    const flush = () => {
      if (contentTimerRef.current === null) {
        return
      }
      void persistNotes().catch(() => undefined)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [persistNotes])

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
        // The rows themselves are gone already — reminders cascade from tasks in the schema. This
        // drops the local copies, which nothing renders once their task is gone but which would
        // otherwise accumulate in memory for the rest of the session.
        setReminders((current) => current.filter((item) => !taskIds.has(item.taskId)))
        lastConfirmedRef.current = snapshotFromParts(
          next.folders,
          next.tasks,
          next.subtasks,
          tagsRef.current,
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
        isPinned: false,
        noteKind: 'note',
        dueAt: null,
        completed: false,
        completedAt: null,
        tags: [],
        color: null,
        gridLayouts: null,
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

  const moveTaskToFolder = useCallback(
    (taskId: string, targetFolderId: string) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) =>
          task.id === taskId
            ? { ...task, folderId: targetFolderId, sortOrder: nextTaskSortOrder(tasksRef.current, targetFolderId) }
            : task,
        ),
        subtasks: subtasksRef.current,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const updateTaskContent = useCallback(
    (taskId: string, content: string, options?: { immediate?: boolean }) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) => (task.id === taskId ? { ...task, content } : task)),
        subtasks: subtasksRef.current,
      })
      // The debounce here exists for typing — it's waiting for the next keystroke. A discrete
      // edit has no next keystroke, so it saves the way every other discrete action in this file
      // does: right now. Ticking a checklist item from a card and reloading a moment later was
      // otherwise a race against the timer, and the reload usually won.
      if (options?.immediate) {
        void persistNotes().catch(() => undefined)
        return
      }
      scheduleContentPersist()
    },
    [applyNotes, persistNotes, scheduleContentPersist],
  )

  const updateTaskLayouts = useCallback(
    (scope: TaskGridScope, entries: Array<{ taskId: string; placement: Partial<TaskGridPlacement> }>) => {
      if (entries.length === 0) {
        return
      }
      const byId = new Map(entries.map((entry) => [entry.taskId, entry.placement]))
      let changed = false
      const tasks = tasksRef.current.map((task) => {
        const update = byId.get(task.id)
        if (!update) {
          return task
        }
        const current = placementForScope(task, scope)
        // Stamped on every write, including the first one for a card that had no placement at
        // all: an unstamped width reads as the old 24-column canvas and would be scaled up the
        // next time it loaded, so a card resized once would come back five times too wide.
        const next: TaskGridPlacement = { ...current, ...update, v: PLACEMENT_VERSION }
        if (samePlacement(current, next)) {
          return task
        }
        changed = true
        // Merged at both levels, never replaced: the other listings' arrangements live in the
        // same column, and within this listing a drag must not discard a size (or the reverse).
        return { ...task, gridLayouts: { ...task.gridLayouts, [scope]: next } }
      })
      // A drag that ends where it started, or a re-render handing back the layout it was given,
      // would otherwise write and save on every pointer-up.
      if (!changed) {
        return
      }
      applyNotes({ folders: foldersRef.current, tasks, subtasks: subtasksRef.current })
      // Discrete, like every other non-typing action here: the gesture is over when this runs.
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
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
        // Cascaded away in the database along with the task; dropped here so the session's copy
        // doesn't keep them.
        setReminders((current) => current.filter((item) => !taskIds.has(item.taskId)))
        lastConfirmedRef.current = snapshotFromParts(
          next.folders,
          next.tasks,
          next.subtasks,
          tagsRef.current,
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

  const toggleTaskPinned = useCallback(
    (taskId: string) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) =>
          task.id === taskId ? { ...task, isPinned: !task.isPinned } : task,
        ),
        subtasks: subtasksRef.current,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const updateTaskSchedule = useCallback(
    (taskId: string, noteKind: NoteKind, dueAt: string | null) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) => {
          if (task.id !== taskId) {
            return task
          }
          // Turning a task back into a note drops the deadline and the tick with it, matching what
          // the database's normalising trigger does. Applying it here as well keeps the card from
          // showing a stale "overdue" for the moment before the save comes back.
          if (noteKind === 'note') {
            return { ...task, noteKind, dueAt: null, completed: false, completedAt: null }
          }
          return { ...task, noteKind, dueAt }
        }),
        subtasks: subtasksRef.current,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const setTaskCompleted = useCallback(
    (taskId: string, completed: boolean) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) => {
          if (task.id !== taskId) {
            return task
          }
          // The optimistic timestamp is the device's, and it is replaced by the server's on the
          // way back. It exists so the card can show "on time" or "late" in the same frame as the
          // tick rather than a beat later; the two only differ by clock skew, which is exactly
          // what lib/serverClock keeps small.
          return {
            ...task,
            completed,
            completedAt: completed ? new Date().toISOString() : null,
          }
        }),
        subtasks: subtasksRef.current,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  /**
   * Reminders, which do not travel with the notes document.
   *
   * Every other mutation here edits local state and lets persistNotes() upsert the whole snapshot.
   * Reminders can't work that way: that save deletes any row the snapshot doesn't mention, and a
   * reminder carries server-written scheduling (next_run_at) that no client should be authoring.
   * So each of these writes one row and folds the returned row — the server's version of it, with
   * the real next run time — back into local state.
   */
  const getRemindersForTask = useCallback(
    (taskId: string) => reminders.filter((reminder) => reminder.taskId === taskId),
    [reminders],
  )

  const runReminderWrite = useCallback(async (write: () => Promise<void>) => {
    setReminderError(null)
    try {
      await write()
    } catch (error) {
      setReminderError(
        error instanceof RepositoryError ? error.message : 'Could not save the reminder.',
      )
      throw error
    }
  }, [])

  const addReminder = useCallback(
    async (taskId: string, draft: ReminderDraft) => {
      await runReminderWrite(async () => {
        const created = await remindersRepository.create(taskId, normalizeDraft(draft))
        setReminders((current) => [...current, created])
      })
    },
    [remindersRepository, runReminderWrite],
  )

  const updateReminder = useCallback(
    async (reminderId: string, taskId: string, draft: ReminderDraft) => {
      await runReminderWrite(async () => {
        const saved = await remindersRepository.update(reminderId, normalizeDraft(draft), taskId)
        setReminders((current) =>
          current.map((reminder) => (reminder.id === reminderId ? saved : reminder)),
        )
      })
    },
    [remindersRepository, runReminderWrite],
  )

  const setReminderActive = useCallback(
    async (reminderId: string, isActive: boolean) => {
      await runReminderWrite(async () => {
        const saved = await remindersRepository.setActive(reminderId, isActive)
        setReminders((current) =>
          current.map((reminder) => (reminder.id === reminderId ? saved : reminder)),
        )
      })
    },
    [remindersRepository, runReminderWrite],
  )

  /**
   * Pulls the reminder list back from the server.
   *
   * Every other write here updates local state from its own response, which is enough for changes
   * this app makes. A reminder firing is not one of those: the sweep runs on a schedule with no
   * browser involved, and the row it stamps is invisible here until it is re-read. Failure is
   * silent on purpose — the list already on screen is still the best answer available.
   */
  const refreshReminders = useCallback(async () => {
    try {
      const items = await Promise.resolve(remindersRepository.listAll())
      setReminders(items)
    } catch {
      /* Keep what we have. */
    }
  }, [remindersRepository])

  const deleteReminder = useCallback(
    async (reminderId: string) => {
      await runReminderWrite(async () => {
        await remindersRepository.remove(reminderId)
        setReminders((current) => current.filter((reminder) => reminder.id !== reminderId))
      })
    },
    [remindersRepository, runReminderWrite],
  )

  /**
   * The tag catalogue, and the rules that keep it and the tasks agreeing.
   *
   * Tasks carry tag *names*, not ids — that is what every filter, pill and search in the app
   * reads, and what the repository resolves against the join table when it saves. So the
   * catalogue is authoritative about which tags exist, and a name on a task is a reference into
   * it. Two consequences, both handled here: a name a task uses must exist in the catalogue
   * (ensureTags), and a rename or delete has to sweep the tasks as well as the catalogue.
   *
   * Matching is case-insensitive on the way in and preserves the casing you first typed, so
   * "job", "Job" and "JOB" are one tag rather than three — which is the entire point of a
   * catalogue you pick from.
   */
  const findTagByName = useCallback((name: string): Tag | undefined => {
    const key = name.trim().toLowerCase()
    return tagsRef.current.find((tag) => tag.name.toLowerCase() === key)
  }, [])

  /** The catalogue with any of these names that isn't in it yet added. Returns the same array
   *  when there is nothing to add, so callers can tell whether the catalogue actually moved. */
  const withTags = useCallback((names: string[]): Tag[] => {
    let next = tagsRef.current
    for (const raw of names) {
      const name = raw.trim()
      if (!name) {
        continue
      }
      const key = name.toLowerCase()
      if (next.some((tag) => tag.name.toLowerCase() === key)) {
        continue
      }
      next = [...next, { id: crypto.randomUUID(), name }]
    }
    return next
  }, [])

  const deleteTag = useCallback(
    (tagId: string) => {
      const current = tagsRef.current.find((tag) => tag.id === tagId)
      if (!current) {
        return
      }
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) =>
          task.tags.includes(current.name)
            ? { ...task, tags: task.tags.filter((tag) => tag !== current.name) }
            : task,
        ),
        subtasks: subtasksRef.current,
        tags: tagsRef.current.filter((tag) => tag.id !== tagId),
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, persistNotes],
  )

  const updateTaskTags = useCallback(
    (taskId: string, names: string[]) => {
      // Deduped against the catalogue's own casing, so picking "Job" and typing "job" into the
      // same note is one tag on it, not two chips that look like a bug.
      const resolved: string[] = []
      for (const raw of names) {
        const name = raw.trim()
        if (!name) {
          continue
        }
        const canonical = findTagByName(name)?.name ?? name
        if (!resolved.includes(canonical)) {
          resolved.push(canonical)
        }
      }
      const nextTags = withTags(resolved)
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) =>
          task.id === taskId ? { ...task, tags: resolved } : task,
        ),
        subtasks: subtasksRef.current,
        // Only when it actually changed: passing the same array every time would still be
        // correct, but this keeps "did the catalogue move" honest for anything watching it.
        tags: nextTags === tagsRef.current ? undefined : nextTags,
      })
      void persistNotes().catch(() => undefined)
    },
    [applyNotes, findTagByName, persistNotes, withTags],
  )

  const updateTaskColor = useCallback(
    (taskId: string, color: TaskColor | null) => {
      applyNotes({
        folders: foldersRef.current,
        tasks: tasksRef.current.map((task) => (task.id === taskId ? { ...task, color } : task)),
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
          tagsRef.current,
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

  // Goes straight to the repository (a fresh signed URL, or a re-check of the in-memory
  // store) instead of reading React state, so it's correct even the instant after an upload,
  // before that state has had a chance to re-render.
  const getAttachmentPreviewUrl = useCallback(
    (attachmentId: string): Promise<string | null> => Promise.resolve(attachmentRepository.getPreviewUrl(attachmentId)),
    [attachmentRepository],
  )

  const addPersistedAttachment = useCallback(
    (taskId: string, file: File): Promise<Attachment | null> => {
      if (!beginExclusiveAction(actionLocksRef.current, `upload-attachment:${taskId}`)) {
        return Promise.resolve(null)
      }
      const requestUserId = userIdRef.current
      setIsUploadingAttachment(true)
      return Promise.resolve(attachmentRepository.createAttachment(taskId, file))
        .then((attachment) => {
          if (
            !shouldApplySessionResult({
              cancelled: false,
              requestUserId,
              currentUserId: userIdRef.current,
            })
          ) {
            return null
          }
          setAttachments((current) => [...current, attachment])
          setPersistError(null)
          return attachment
        })
        .catch((error: unknown) => {
          if (
            !shouldApplySessionResult({
              cancelled: false,
              requestUserId,
              currentUserId: userIdRef.current,
            })
          ) {
            return null
          }
          const message = error instanceof RepositoryError ? error.message : 'Could not attach the file.'
          setPersistError(message)
          throw error instanceof RepositoryError ? error : new RepositoryError(message, { cause: error })
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
        return Promise.resolve(null)
      }
      return addPersistedAttachment(taskId, file)
    },
    [addPersistedAttachment],
  )

  const addPdfAttachment = useCallback(
    (taskId: string, file: File) => {
      if (!isAcceptedPdfFile(file)) {
        return Promise.resolve(null)
      }
      return addPersistedAttachment(taskId, file)
    },
    [addPersistedAttachment],
  )

  const addDocumentAttachment = useCallback(
    (taskId: string, file: File) => {
      if (!detectDocumentType(file)) {
        return Promise.resolve(null)
      }
      return addPersistedAttachment(taskId, file)
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
      moveTaskToFolder,
      updateTaskContent,
      updateTaskLayouts,
      updateTaskTitle,
      deleteTask,
      toggleTaskImportant,
      toggleTaskPinned,
      updateTaskSchedule,
      setTaskCompleted,
      getRemindersForTask,
      addReminder,
      updateReminder,
      setReminderActive,
      deleteReminder,
      refreshReminders,
      reminderError,
      updateTaskTags,
      tags,
      deleteTag,
      updateTaskColor,
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
      getAttachmentPreviewUrl,
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
      moveTaskToFolder,
      updateTaskContent,
      updateTaskLayouts,
      updateTaskTitle,
      deleteTask,
      toggleTaskImportant,
      toggleTaskPinned,
      updateTaskSchedule,
      setTaskCompleted,
      getRemindersForTask,
      addReminder,
      updateReminder,
      setReminderActive,
      deleteReminder,
      refreshReminders,
      reminderError,
      updateTaskTags,
      tags,
      deleteTag,
      updateTaskColor,
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
      getAttachmentPreviewUrl,
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
    return <LoadingSplash label="Signing you in" />
  }

  if (!ready && !loadError) {
    return <LoadingSplash label="Opening your notes" />
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
          <div className="absolute inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm text-[var(--color-text-muted)]">
            <Spinner />
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
