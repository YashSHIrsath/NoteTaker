import { useFolders } from '../hooks/useFolders'
import { FolderTree } from '../components/tree/FolderTree'
import { EmptyState } from '../components/common/EmptyState'

export function TreePage() {
  const { getForest } = useFolders()
  const forest = getForest()

  if (forest.length === 0) {
    return (
      <EmptyState
        title="Tree"
        description="Create a folder in MyNotes to see it here."
      />
    )
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-auto px-4 py-5 sm:px-6">
      <FolderTree folders={forest} />
    </div>
  )
}
