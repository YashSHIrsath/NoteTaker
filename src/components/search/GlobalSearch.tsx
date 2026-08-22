import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import {
  ClipboardList,
  Folder as FolderIcon,
  ListTree,
  LogOut,
  Moon,
  Plus,
  Star,
  Sun,
  User,
} from 'lucide-react'
import { SearchInput } from './SearchInput'
import { SearchResults } from './SearchResults'
import { CommandActionList, type CommandAction } from './CommandActionList'
import { useFolders } from '../../hooks/useFolders'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { collectSubtaskAncestorIds } from '../../lib/subtasks'
import { focusTaskTitle } from '../../lib/focusTaskTitle'
import { searchNotes, type SearchResult } from '../../services/search/searchNotes'
import { cn } from '../../lib/cn'

export interface GlobalSearchProps {
  className?: string
}

const NEW_TASK_TITLE = 'New note'

export function GlobalSearch({ className }: GlobalSearchProps) {
  const navigate = useNavigate()
  const { folders, tasks, subtasks, expandSubtask, getFolder, createTask } = useFolders()
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const folderMatch = useMatch('/folder/:folderId')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(
    () => searchNotes(query, { folders, tasks, subtasks }),
    [folders, query, subtasks, tasks],
  )

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const runAction = useCallback(
    (run: () => void) => {
      close()
      setQuery('')
      run()
    },
    [close],
  )

  // Commands are always available for navigation/theme/sign-out; "New task" only makes sense
  // — and only shows up — while you're actually looking at a folder to create it in.
  const currentFolder = folderMatch?.params.folderId ? getFolder(folderMatch.params.folderId) : undefined
  const commandActions: CommandAction[] = useMemo(() => {
    const actions: CommandAction[] = []
    if (currentFolder) {
      actions.push({
        id: 'new-task',
        label: `New task in ${currentFolder.name}`,
        icon: <Plus className="h-4 w-4" aria-hidden />,
        run: () =>
          runAction(() => {
            void createTask(NEW_TASK_TITLE, currentFolder.id).then((task) => {
              navigate(`/folder/${currentFolder.id}`, { state: { openTaskId: task.id } })
              focusTaskTitle(task.id)
            })
          }),
      })
    }
    actions.push(
      {
        id: 'go-tree',
        label: 'Go to Tree',
        icon: <ListTree className="h-4 w-4" aria-hidden />,
        run: () => runAction(() => navigate('/')),
      },
      {
        id: 'go-mynotes',
        label: 'Go to MyNotes',
        icon: <FolderIcon className="h-4 w-4" aria-hidden />,
        run: () => runAction(() => navigate('/mynotes')),
      },
      {
        id: 'go-tasks',
        label: 'Go to Tasks',
        icon: <ClipboardList className="h-4 w-4" aria-hidden />,
        run: () => runAction(() => navigate('/tasks')),
      },
      {
        id: 'go-important',
        label: 'Go to Important',
        icon: <Star className="h-4 w-4" aria-hidden />,
        run: () => runAction(() => navigate('/important')),
      },
      {
        id: 'go-profile',
        label: 'Go to Profile',
        icon: <User className="h-4 w-4" aria-hidden />,
        run: () => runAction(() => navigate('/profile')),
      },
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        icon: theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />,
        run: () => runAction(toggleTheme),
      },
      {
        id: 'sign-out',
        label: 'Sign out',
        icon: <LogOut className="h-4 w-4" aria-hidden />,
        run: () => runAction(() => void signOut().catch(() => undefined)),
      },
    )
    return actions
  }, [currentFolder, createTask, navigate, runAction, theme, toggleTheme, signOut])

  const filteredActions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return commandActions
    }
    return commandActions.filter((action) => action.label.toLowerCase().includes(needle))
  }, [commandActions, query])

  const selectResult = useCallback(
    (result: SearchResult) => {
      if (result.revealSubtaskId) {
        const ancestors = collectSubtaskAncestorIds(subtasks, result.revealSubtaskId)
        for (const ancestorId of ancestors) {
          expandSubtask(ancestorId)
        }
      }
      close()
      setQuery('')
      const state = result.taskId
        ? { openTaskId: result.taskId, revealSubtaskId: result.revealSubtaskId }
        : result.revealSubtaskId
          ? { revealSubtaskId: result.revealSubtaskId }
          : null
      navigate(result.href, { state })
    },
    [close, expandSubtask, navigate, subtasks],
  )

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        close()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [close, open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
        return
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        close()
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, open])

  const showPanel = open

  return (
    <div ref={rootRef} className={cn('relative min-w-0 flex-1', className)}>
      <SearchInput
        inputRef={inputRef}
        value={query}
        onChange={(value) => {
          setQuery(value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            close()
            inputRef.current?.blur()
          }
        }}
      />
      {showPanel ? (
        <div
          className={cn(
            'fixed inset-x-3 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-[var(--color-border)] sm:top-14',
            'bg-[var(--color-surface)] shadow-lg',
            'sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:left-auto sm:mt-1 sm:w-[min(100%,24rem)]',
          )}
        >
          <CommandActionList actions={filteredActions} />
          <SearchResults query={query} results={results} onSelect={selectResult} />
        </div>
      ) : null}
    </div>
  )
}
