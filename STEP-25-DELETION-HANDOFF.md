# STEP 25 — Safe deletion handoff

This document is a handoff for the **safe delete** work (folders, tasks, subtasks, attachments). It lists the functions/classes added or changed, what they do, call order, UI wiring, errors, security, and limitations.

Do not use the service-role key. Do not weaken RLS. LocalStorage (`MYNOTES_DATA`) stays as an inactive fallback.

---

## Product rules this code assumes

- Folders nest via `parentId`. Tasks belong to a folder (`folderId`). Subtasks nest under a task (`taskId`, `parentSubtaskId`). Attachments belong to a task.
- Important is a **filter** on `isImportant`, not a separate table. Deleting a starred folder/task removes it from Important because the row is gone.
- PostgreSQL FK cascades remove child **rows** (nested folders, tasks, subtasks, attachment **metadata**). Cascades do **not** remove Supabase Storage objects.
- Storage RLS (`storage_attachment_allowed`) requires the **task to still exist**. Physical files must be deleted **before** the parent task/folder row.
- UI must not optimistically remove large trees. Order is: confirm → Storage → DB parent delete → then update React state.
- UI components must not call Supabase directly. They go through FolderContext → `NotesDeletionService` / attachment repository.

---

## Delete pipeline (conceptual)

```
User clicks trash
  → ConfirmDialog (shared)
  → FolderContext.delete* (exclusive lock + flush pending persist)
  → NotesDeletionService
       1. Identify affected folder/task/subtask IDs from the loaded snapshot
       2. listStoragePathsForTaskIds (chunked, 50)
       3. removeStoragePaths
       4. notes.deleteFolder | deleteTask | deleteSubtask (parent row only)
       5. Postgres CASCADE cleans child metadata/rows
  → On success: filter in-memory folders/tasks/subtasks/attachments
  → lastConfirmedRef updated so the next snapshot save does not fight the delete
  → Navigate off a deleted /folder/:id or /task/:id if needed
```

If Storage fails: **do not** delete the DB row. Item stays visible. Error banner.

If Storage succeeds and DB fails: files may already be gone; metadata/rows remain; UI stays; banner shown; retry should re-list paths (often empty) then delete the row.

---

## New / changed files

| Path | Role |
|------|------|
| `src/components/ui/ConfirmDialog.tsx` | Shared confirm UI |
| `src/components/common/RowDeleteButton.tsx` | Small trash icon |
| `src/hooks/useDeleteConfirmation.ts` | Dialog open/loading/confirm state |
| `src/hooks/useDeleteFolder.ts` | Folder confirm + navigation |
| `src/hooks/useDeleteTask.ts` | Task confirm + navigation |
| `src/hooks/useDeleteSubtask.ts` | Subtask confirm |
| `src/hooks/useDeleteAttachment.ts` | Attachment confirm |
| `src/services/deletion/deleteCopy.ts` | Confirmation titles/body + `chunkIds` |
| `src/services/deletion/notesDeletionService.ts` | Storage-then-DB orchestration |
| `src/services/deletion/deletionChecks.ts` | Automated deletion checks |
| `src/lib/folders.ts` | `collectFolderSubtreeIds` |
| `src/lib/tasks.ts` | `collectTaskIdsInFolders` |
| `src/lib/subtasks.ts` | `collectSubtaskSubtreeIds` |
| `src/repositories/types.ts` | Delete + Storage listing APIs |
| `src/repositories/supabase/supabaseNotesRepository.ts` | Owned-row delete |
| `src/repositories/supabase/supabaseAttachmentRepository.ts` | Attachment + path cleanup |
| `src/repositories/localNotesRepository.ts` | LocalStorage subtree delete |
| `src/repositories/localAttachmentRepository.ts` | No-op Storage listing |
| `src/context/FolderContext.tsx` | Locks, persist flush, pessimistic UI update |
| `src/components/ui/Button.tsx` | `variant="danger"` |
| `src/repositories/supabase/runChecks.ts` | Wires deletion checks |
| `src/repositories/supabase/attachmentHardeningChecks.ts` | Mock `.delete().eq().select()` |

---

## 1. Helpers — tree collection

### `collectFolderSubtreeIds(folders, rootId)` — `src/lib/folders.ts`

- Returns `[rootId, ...all nested descendant folder ids]` (depth-first via `getChildFolders`).
- Used for confirmation copy, Storage lookup (which tasks sit in this tree), and local snapshot filtering.

### `collectTaskIdsInFolders(tasks, folderIds)` — `src/lib/tasks.ts`

- Returns task ids whose `folderId` is in the given folder-id set/iterable.
- Does not walk subtasks; attachments hang off tasks.

### `collectSubtaskSubtreeIds(subtasks, rootId)` — `src/lib/subtasks.ts`

- Returns `[rootId, ...descendant subtask ids]` using `getChildSubtasks`.
- Recursive subtasks: deleting a parent deletes listed children in the DB via CASCADE; local repo filters the same ids.

### `chunkIds(ids, size = 50)` — `src/services/deletion/deleteCopy.ts`

- Splits id lists for `.in('task_id', chunk)` and Storage `remove` batches.
- Default 50 to stay under PostgREST/Storage practical limits.

---

## 2. Confirmation copy — `src/services/deletion/deleteCopy.ts`

These functions only build strings. They do not delete anything.

### `folderDeleteCopy(folder, folders, tasks)`

- **Title:** `Delete "{folder.name}"?`
- **Empty** (no nested folders, no tasks in the subtree):  
  `This folder is empty. It will be permanently deleted.`
- **Non-empty:**  
  `This will permanently delete:` plus lines for this folder, nested folders, tasks, subtasks, attachments.
- Also returns `folderIds` and `taskIds` used for copy logic.

### `taskDeleteCopy(task)`

- Title uses `task.title` or `Untitled`.
- Body: `This will permanently delete this note, its subtasks and attachments.`

### `subtaskDeleteCopy(subtask, subtasks)`

- Leaf: `This subtask will be permanently deleted.`
- With children: `This will also delete:` then up to 8 child titles as `- Name`, then `- and N more` if needed.

### `attachmentDeleteCopy(name)`

- Title `Delete "{name}"?`
- Body: `This will permanently delete the file.`

---

## 3. Service — `NotesDeletionService`

File: `src/services/deletion/notesDeletionService.ts`

Constructor: `(notes: NotesDataRepository, attachments: AttachmentDataRepository)`.

FolderContext constructs one instance and holds it in `useMemo`.

### `deleteFolder(folderId, folders, tasks): Promise<FolderDeleteResult>`

1. Find folder in the **loaded** `folders` array. Missing → `RepositoryError('Could not delete the folder.')`.
2. `deletedFolderIds = collectFolderSubtreeIds(...)`.
3. `deletedTaskIds = collectTaskIdsInFolders(...)`.
4. `removeFilesForTasks(deletedTaskIds)` (no-op if empty — empty folders skip Storage).
5. `notes.deleteFolder(folderId)` — **only the parent folder row**. Nested folders/tasks/subtasks/attachment rows rely on FK CASCADE (Supabase). Local repo implements the equivalent filter itself.
6. Returns `{ parentId, deletedFolderIds, deletedTaskIds }` for navigation and UI filter.

### `deleteTask(taskId, tasks): Promise<TaskDeleteResult>`

1. Find task or throw `Could not delete the task.`
2. `removeFilesForTasks([taskId])`.
3. `notes.deleteTask(taskId)` — CASCADE removes subtasks + attachment metadata.
4. Returns `{ folderId, deletedTaskIds: [taskId] }`.

### `deleteSubtask(subtaskId, subtasks): Promise<string[]>`

1. Subtask must exist in the loaded list or throw `Could not delete the subtask.`
2. Collect subtree ids (for UI after success).
3. `notes.deleteSubtask(subtaskId)` — CASCADE children. **No Storage** (attachments are on tasks, not subtasks).
4. Returns all removed subtask ids.

### `removeFilesForTasks(taskIds)` (private)

- Empty list → return.
- Chunk task ids, `listStoragePathsForTaskIds` each chunk, concatenate paths.
- `removeStoragePaths(paths)`.
- If this throws, the caller never reaches `notes.delete*`.

---

## 4. Repository APIs

### `NotesDataRepository` (`src/repositories/types.ts`)

Added:

- `deleteFolder(folderId)`
- `deleteTask(taskId)`
- `deleteSubtask(subtaskId)`

All `MaybePromise<void>` (sync local, async Supabase).

### `AttachmentDataRepository`

Added:

- `listStoragePathsForTaskIds(taskIds)`
- `removeStoragePaths(paths)`

Existing `deleteAttachment(id)` still used for single-file delete.

---

### Supabase notes — `SupabaseNotesDataRepository`

`deleteFolder` / `deleteTask` / `deleteSubtask` all call `deleteOwnedRow(table, id, fallback)`.

`deleteOwnedRow`:

1. `requireSession()` — unsigned → user-facing “signed in” error.
2. `requireUuid(id)` — invalid id never hits the DB as a raw error.
3. `from(table).delete().eq('id', id).select('id')`.
4. Postgres/Supabase errors → `throwIfError` / `toRepositoryError` with the **fallback** string (never raw SQL).
5. Zero rows (`data.length === 0`) → same fallback. That is how **another user’s row** (RLS hides it) is treated: delete “succeeds” at the HTTP layer with no matching row, so we treat it as failure.

Child rows are **not** deleted one-by-one in this method. CASCADE does that after the parent is gone.

---

### Local notes — `LocalNotesDataRepository`

Used when Supabase env vars are missing.

- `deleteFolder`: if folder missing, throw. Else filter snapshot: subtree folders, tasks in those folders, subtasks of those tasks, then `save`.
- `deleteTask`: drop that task and all its subtasks.
- `deleteSubtask`: drop subtree of that subtask.

There are no Storage objects. `listStoragePathsForTaskIds` on the local attachment repo returns `[]`.

---

### Supabase attachments — `SupabaseAttachmentDataRepository`

#### `deleteAttachment(id)` — single file

1. Require user.
2. Load row (cache or DB). Missing → `Could not delete the attachment.`
3. If `storage_path`: `storage.from(bucket).remove([path])`. Failure → `Could not delete the file.` **Metadata is not deleted.**
4. `from('attachments').delete().eq('id', id).select('id')`.
5. Error or zero rows → `Could not delete the attachment.` (Storage may already be gone.)
6. Drop cache entry only after metadata delete succeeds.
7. FolderContext only removes the attachment from React state after this promise resolves.

#### `listStoragePathsForTaskIds(taskIds)`

- RLS: only paths the current user can see.
- Selects `storage_path` where `task_id IN (...)`.
- Drops null paths.

#### `removeStoragePaths(paths)`

- Unique, non-empty paths.
- Removes in chunks of 50 via Storage API.
- Failures become `Could not delete the file.`

---

### Local attachments — `LocalAttachmentDataRepository`

- `listStoragePathsForTaskIds` → `[]`
- `removeStoragePaths` → no-op
- `deleteAttachment` removes in-memory maps only (session files, not Storage)

---

## 5. FolderContext delete methods

File: `src/context/FolderContext.tsx`

Shared pattern for folder/task/subtask:

1. `beginExclusiveAction(locks, 'delete-folder:' + id)` (or `delete-task:`, `delete-subtask:`). If already locked → `Please wait for the current delete to finish.`
2. `await persistNotes()` so unsaved edits are flushed **before** delete (avoids save rewriting a deleted tree).
3. Call `deletionService.delete*`.
4. **Only on success:** `applyNotes` filtered lists; attachments filtered by deleted task ids; `lastConfirmedRef` set to the new snapshot so fingerprint matches and persist does not immediately re-save a stale tree.
5. On catch: `setPersistError(user-facing message)`, rethrow `RepositoryError`. **Do not** remove items from state.
6. `finally`: `endExclusiveAction`.

### `deleteFolder(folderId)`

Returns `{ parentId, deletedFolderIds, deletedTaskIds }`.

Filters:

- folders not in `deletedFolderIds`
- tasks not in `deletedTaskIds`
- subtasks whose `taskId` is not in `deletedTaskIds`
- attachments whose `taskId` is not in `deletedTaskIds`

### `deleteTask(taskId)`

Same lock/persist/service pattern. Filters that task, its subtasks, its attachments.

### `deleteSubtask(subtaskId)`

Filters subtasks whose id is in the returned subtree id list. No attachment change.

### `deleteAttachment(attachmentId)`

Lock `delete-attachment:{id}`. Sets `removingAttachmentId` for list busy state.

Does **not** go through `NotesDeletionService`. Calls `attachmentRepository.deleteAttachment` (Storage then metadata).

Session guard: if the user changed, skip applying the result.

Success: drop from `attachments` state, clear persist error.

Failure: banner, rethrow, **keep** the row in UI.

---

## 6. Shared confirmation UX

### `ConfirmDialog` — `src/components/ui/ConfirmDialog.tsx`

Props: `open`, `title`, `description`, `confirmLabel` (default `Delete`), `loading`, `onCancel`, `onConfirm`.

- `open === false` → render `null`.
- Backdrop + dialog (`role="dialog"`, `aria-modal`).
- Description uses `whitespace-pre-wrap` so newline lists render.
- Cancel + danger confirm.
- While `loading`: confirm label is **Deleting…**, Cancel disabled, backdrop click ignored.
- Danger styling: `Button` `variant="danger"` (`#b42318`).

**Keep this as the only confirm UI for deletes.** Do not add per-button custom dialogs.

### `useDeleteConfirmation()` — `src/hooks/useDeleteConfirmation.ts`

**Must stay a `.ts` file.** It uses `createElement(ConfirmDialog, …)` instead of JSX.

Reason: Vite HMR previously requested `useDeleteConfirmation.ts` after a rename to `.tsx`. Firefox then failed with `NS_ERROR_CORRUPTED_CONTENT` / empty MIME type → **full white screen**.

State: `open`, `loading`, `request`.

- `requestDelete({ title, description, onConfirm })` — ignored while `loading` (blocks a second confirm).
- Confirm runs `onConfirm()`, then closes dialog on both success and failure (error is shown via FolderContext banner, not inside the dialog).
- `finally` clears `loading`.
- Returns `{ requestDelete, dialog }`. Callers **must render `{dialog}`**.

### `RowDeleteButton` — `src/components/common/RowDeleteButton.tsx`

Small `Trash2` `IconButton`. `stopPropagation` so it does not open the folder/task row. `compact` for tree rows.

---

## 7. Feature hooks

Each hook uses `useDeleteConfirmation` internally. Render its `dialog` in the same component that calls `request*Delete`.

### `useDeleteFolder()` → `{ requestFolderDelete, dialog }`

- Looks up folder; no-op if missing.
- Copy from `folderDeleteCopy`.
- On confirm: `deleteFolder(folderId)` then navigation:
  - If URL is `/folder/:id` and that id is in `deletedFolderIds` → `replace` to `/folder/{parentId}` or `/` (MyNotes).
  - Else if URL is `/task/:id` and that task is in `deletedTaskIds` → same parent/MyNotes (the task’s folder is inside the deleted tree).

Wired in: `FolderView` (header), `FolderItem` (MyNotes / Important folders), `FolderTreeNode` (Tree).

### `useDeleteTask()` → `{ requestTaskDelete, dialog }`

- On confirm: `deleteTask`. If URL is exactly `/task/{taskId}` → `replace` `/folder/{result.folderId}`.

Wired in: `TaskEditor` header, `TaskItem`, `ImportantPage` task rows.

### `useDeleteSubtask()` → `{ requestSubtaskDelete, dialog }`

- No route change (stay on the task).

Wired in: `TaskEditor` → `SubtaskList` `onDelete`. `SubtaskItem` **Remove** button.

### `useDeleteAttachment()` → `{ requestAttachmentDelete, dialog }`

- `requestAttachmentDelete(attachmentId, name)`.

Wired in: `TaskEditor` → `AttachmentList` `onRemove`.

---

## 8. Navigation and missing routes

`FolderViewPage` / `TaskViewPage` still show EmptyState if the id is missing (race or stale URL). Hooks try to `replace` **before** the user sits on a broken route.

Important page: `FolderItem` / task delete use the same hooks; starred items disappear because records are gone, not because Important is a separate collection.

---

## 9. Error / loading / duplicate delete

| Layer | Behavior |
|--------|----------|
| Confirm loading | Button `Deleting…`; cancel blocked; second `requestDelete` ignored |
| Exclusive locks | `delete-folder:{id}`, `delete-task:{id}`, `delete-subtask:{id}`, `delete-attachment:{id}` |
| Failure | Item remains; dialog closes; `persistError` banner; no fake success |
| Rest of UI | Not globally frozen; other rows still usable |

`runDuplicateDeleteLockCheck` asserts the lock set rejects a second `delete-folder:root` until `endExclusiveAction`.

---

## 10. Security

- Anon key only. Session required on every delete.
- RLS: delete/select only own folders/tasks/subtasks/attachments/storage objects.
- Zero-row delete treated as failure (cannot delete another user’s records).
- Storage paths are `{auth.uid()}/{taskId}/{attachmentId}-{name}` (existing convention). Listing/removing another user’s files is blocked by Storage RLS.
- Do not add a server job that uses the service role unless product/security explicitly changes.

---

## 11. Automated checks

Entry: `npx tsx src/repositories/supabase/runChecks.entry.ts`  
(`runAllRepositoryChecks` in `src/repositories/supabase/runChecks.ts` calls these.)

`runDeletionChecks()`:

- Subtree includes nested folders and their tasks.
- Subtask subtree includes children.
- Empty vs non-empty folder copy.
- Task copy mentions attachments.
- Subtask copy lists child titles.
- Storage paths removed **before** folder row.
- Storage failure → no DB delete.
- DB failure after Storage → UI layer (`deleted` array) stays empty.
- Empty folder: no Storage, row still deleted.
- Simulated foreign/empty delete throws `RepositoryError`.

`runDuplicateDeleteLockCheck()`: lock/retry.

Attachment hardening: `delete().eq().select()` mock; Storage removed even when metadata delete fails; errors stay `RepositoryError`.

Build: `npm run build` (`tsc -b && vite build`).

---

## 12. UI placement (do not redesign)

| Target | Control |
|--------|---------|
| Folder header | `RowDeleteButton` next to star |
| Folder row / tree | `RowDeleteButton` (tree uses `compact`) |
| Task header / list / Important | `RowDeleteButton` |
| Subtask | existing **Remove** text button → confirm |
| Attachment | existing remove on `AttachmentList` → confirm |

---

## 13. Limitations (known)

1. **Loaded snapshot only.** Task ids for Storage cleanup come from in-memory folders/tasks. A file created in another tab and not yet loaded can be left in Storage if this session deletes the folder/task first.
2. **Storage then DB is not a distributed transaction.** File gone + row still present is possible; retry is the recovery.
3. **No bulk admin wipe.** Large trees are cleaned client-side in chunks of 50, still as the signed-in user.
4. **Local fallback** has no Storage; in-memory files may linger in the local attachment maps after a task delete (UI still filters attachments).
5. **Concurrent HMR / file rename.** Keep `useDeleteConfirmation.ts` as `.ts`. Do not rename to `.tsx` without updating Vite module URLs (Firefox MIME white screen).

---

## 14. What not to do next

- Do not add a second confirm component per screen.
- Do not delete child rows manually in the Supabase notes repo unless CASCADE is removed.
- Do not delete Storage **after** the task row (RLS will block).
- Do not implement realtime, offline mode, schema redesign, or service-role cleanup unless a later step asks for it.
- Do not auto-migrate LocalStorage; do not delete the LocalStorage fallback.

---

## 15. Quick “where do I change X?”

| Change | Where |
|--------|--------|
| Warning text | `deleteCopy.ts` |
| Storage-before-DB order | `notesDeletionService.ts` |
| After-success UI filter | `FolderContext.tsx` `deleteFolder` / `deleteTask` / `deleteSubtask` / `deleteAttachment` |
| Post-delete URL | `useDeleteFolder.ts` / `useDeleteTask.ts` |
| Dialog look | `ConfirmDialog.tsx` |
| Trash icon | `RowDeleteButton.tsx` |
| RLS / zero-row handling | `supabaseNotesRepository.ts` `deleteOwnedRow` |
| Single file Storage+metadata | `supabaseAttachmentRepository.ts` `deleteAttachment` |
| Checks | `deletionChecks.ts` + `runChecks.ts` |
