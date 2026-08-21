import type { Folder } from '../../types'
import { FolderItem } from './FolderItem'

export interface RootFolderListProps {
  folders: Folder[]
  onOpenFolder: (folderId: string) => void
}

export function RootFolderList({ folders, onOpenFolder }: RootFolderListProps) {
  return (
    <ul className="mt-1 space-y-0.5">
      {folders.map((folder) => (
        <li key={folder.id}>
          <FolderItem
            folderId={folder.id}
            parentId={null}
            name={folder.name}
            important={folder.isImportant}
            onClick={() => onOpenFolder(folder.id)}
          />
        </li>
      ))}
    </ul>
  )
}
