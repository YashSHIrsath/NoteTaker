import type { Folder } from '../../types'
import { FolderItem } from './FolderItem'
import { getFolderCategory } from '../../lib/folderColor'

export interface RootFolderListProps {
  folders: Folder[]
  onOpenFolder: (folderId: string) => void
}

export function RootFolderList({ folders, onOpenFolder }: RootFolderListProps) {
  return (
    <ul className="mt-1 space-y-0.5">
      {folders.map((folder, index) => (
        <li key={folder.id}>
          <FolderItem
            folderId={folder.id}
            parentId={null}
            name={folder.name}
            important={folder.isImportant}
            category={getFolderCategory(index)}
            onClick={() => onOpenFolder(folder.id)}
          />
        </li>
      ))}
    </ul>
  )
}
