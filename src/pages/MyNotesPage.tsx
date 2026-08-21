import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { CreateFolderDialog } from '../components/folder/CreateFolderDialog'
import { RootFolderList } from '../components/folder/RootFolderList'
import { useFolders } from '../hooks/useFolders'
import { getRootFolders } from '../lib/folders'

export function MyNotesPage() {
  const navigate = useNavigate()
  const { folders, createFolder } = useFolders()
  const rootFolders = getRootFolders(folders)
  const [createOpen, setCreateOpen] = useState(false)

  const newFolderButton = (
    <Button variant="subtle" size="sm" onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      New Folder
    </Button>
  )

  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
          MyNotes
        </h1>
        {newFolderButton}
      </div>

      {rootFolders.length === 0 ? (
        <div className="mt-16 flex flex-col items-center px-6 text-center">
          <p className="text-lg font-medium text-[var(--color-text)]">No folders yet.</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Create your first folder.</p>
          <div className="mt-4">{newFolderButton}</div>
        </div>
      ) : (
        <div className="mt-6">
          <RootFolderList
            folders={rootFolders}
            onOpenFolder={(folderId) => navigate(`/folder/${folderId}`)}
          />
        </div>
      )}

      <CreateFolderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(name) => createFolder(name, null)}
      />
    </div>
  )
}
