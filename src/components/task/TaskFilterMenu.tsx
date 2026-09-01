import { createPortal } from 'react-dom'
import { Check, FolderClosed, Hash, SlidersHorizontal } from 'lucide-react'
import type { Task } from '../../types'
import { useAnchoredPanel } from '../../hooks/useAnchoredPanel'
import {
  KIND_FILTERS,
  STATUS_FILTERS,
  filterSummary,
  kindCounts,
  statusCounts,
  type FolderFilterOption,
  type KindFilter,
  type StatusFilter,
} from '../../lib/taskFilters'
import { cn } from '../../lib/cn'

/**
 * Every way of narrowing a list of notes, behind one pill.
 *
 * This replaced three separate controls — a three-way segmented switch, a status dropdown and a
 * tag menu — that between them claimed a whole wrapping row above the cards on four different
 * pages, in a different arrangement on each. Three controls is also three answers to "where is
 * the filter", which is the real cost: the row was the first thing you saw on a page whose
 * subject is the notes underneath it.
 *
 * One pill, one panel, the same in every listing. Closed, it is a button; open, it is the only
 * place any of these questions are asked.
 *
 * The panel is portalled to the body through useAnchoredPanel rather than positioned inside the
 * page. The old dropdown was absolutely positioned inside a scroll container, so it was sliced
 * off at the container's edge and drifted away from its button as the page scrolled underneath
 * it. Portalled, it is measured against the viewport: clamped inside it, opened towards whichever
 * side of the pill has the most room, capped to the height of that room, and re-placed on every
 * scroll.
 */

const PANEL_WIDTH = 288

/** The dot beside each status — the same colours the cards use, so the panel reads as an index
 *  of the states rather than a list of words. */
const STATUS_DOT: Record<StatusFilter, string | null> = {
  all: null,
  incomplete: 'var(--color-text-muted)',
  upcoming: 'var(--task-slate-solid)',
  overdue: 'var(--color-danger)',
  completed: 'var(--cat-emerald)',
  on_time: 'var(--cat-emerald)',
  late: 'var(--task-amber-solid)',
}

/** Options that are a narrower answer to the one above them, indented to say so. */
const STATUS_SUB_OPTIONS = new Set<StatusFilter>(['upcoming', 'overdue', 'on_time', 'late'])

export interface TaskFilterMenuProps {
  /** Every note in scope, unfiltered — the counts are of what *could* be shown, not of what is. */
  tasks: Task[]
  nowMs: number
  kind: KindFilter
  status: StatusFilter
  /** Null when no tag is being filtered on. Omit `tags` entirely to hide the section. */
  tag?: string | null
  tags?: string[]
  /**
   * The folder being filtered on, by id, or null for all of them. Omit `folders` to hide the
   * section — which is what a folder view does, since it is already one folder and narrowing to it
   * would change nothing.
   */
  folder?: string | null
  folders?: FolderFilterOption[]
  onKindChange: (next: KindFilter) => void
  onStatusChange: (next: StatusFilter) => void
  onTagChange?: (next: string | null) => void
  onFolderChange?: (next: string | null) => void
  /**
   * 'fill' makes the pill take its height from whatever wraps it, for rows where it has to line
   * up exactly with a neighbouring control (the Starred page's tab switch).
   */
  size?: 'md' | 'fill'
  className?: string
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-1 pb-1.5 pt-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
      {children}
    </p>
  )
}

export function TaskFilterMenu({
  tasks,
  nowMs,
  kind,
  status,
  tag = null,
  tags,
  folder = null,
  folders,
  onKindChange,
  onStatusChange,
  onTagChange,
  onFolderChange,
  size = 'md',
  className,
}: TaskFilterMenuProps) {
  const { open, setOpen, anchorRef, panelRef, position } =
    useAnchoredPanel<HTMLButtonElement>(PANEL_WIDTH)

  // Counts come from the whole scope rather than from each other's output, so picking "Due-date"
  // can't make the status numbers move under your finger.
  const kinds = kindCounts(tasks)
  const statuses = statusCounts(tasks, nowMs)
  // The pill spells out a name, so it wants the folder's rather than its id — and resolving it
  // here means a selection whose folder has gone stops being counted as a live filter, matching
  // filterByFolder, which stops applying it.
  const folderName = folders?.find((option) => option.id === folder)?.name ?? null
  const { label, activeCount } = filterSummary(kind, status, tag, folderName)
  const filtering = activeCount > 0
  const showTags = Boolean(tags && tags.length > 0 && onTagChange)
  // More than one, because with a single folder every note is in it: the option would be offered,
  // picked, and change nothing.
  const showFolders = Boolean(folders && folders.length > 1 && onFolderChange)

  const reset = () => {
    onKindChange('all')
    onStatusChange('all')
    onTagChange?.(null)
    onFolderChange?.(null)
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-label={filtering ? `Filters: ${label}` : 'Filter notes'}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'anim-press inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
          size === 'fill' ? 'h-full' : 'h-8 sm:h-9',
          filtering
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
          open && !filtering && 'bg-[var(--color-hover)] text-[var(--color-text)]',
          className,
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {/* The label is the first thing to go on a narrow screen: the icon says what the button
            is, and the badge says whether anything is on, which is the part you can't infer. */}
        <span className="hidden max-w-[7rem] truncate sm:inline">{label}</span>
        {activeCount > 1 ? (
          <span className="shrink-0 rounded-full bg-[var(--color-accent)] px-1.5 text-[10px] font-bold leading-[15px] text-white">
            {activeCount}
          </span>
        ) : activeCount === 1 ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)] sm:hidden"
            aria-hidden
          />
        ) : null}
      </button>

      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Filter notes"
              className="anim-panel-in fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]"
              // maxHeight comes from the placement, not from a vh guess: the panel is as tall as
              // the room on the side it opened towards, and its body scrolls for the rest.
              style={{
                top: position.top,
                left: position.left,
                width: PANEL_WIDTH,
                maxHeight: Math.min(position.maxHeight, 480),
              }}
            >
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
                <span className="text-[12.5px] font-semibold text-[var(--color-text)]">Filter</span>
                {filtering ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="anim-press rounded-full px-2 py-0.5 text-[11.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-hover)]"
                  >
                    Reset
                  </button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
                <SectionLabel>Type</SectionLabel>
                <div
                  role="radiogroup"
                  aria-label="Filter by note type"
                  className="flex gap-0.5 rounded-full bg-[var(--color-hover)] p-0.5"
                >
                  {KIND_FILTERS.map((option) => {
                    const active = kind === option.key
                    return (
                      <button
                        key={option.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onKindChange(option.key)}
                        className={cn(
                          'anim-press flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-medium transition-colors',
                          active
                            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                        )}
                      >
                        {option.label}
                        <span className="text-[10px] tabular-nums opacity-60">
                          {kinds[option.key]}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <SectionLabel>Status</SectionLabel>
                <div role="radiogroup" aria-label="Filter by task status">
                  {STATUS_FILTERS.map((option) => {
                    const dot = STATUS_DOT[option.key]
                    const selected = option.key === status
                    return (
                      <div key={option.key}>
                        {/* A rule between "unfinished" and "finished": the list is a ladder, and
                            the two halves are what people scan for. */}
                        {option.key === 'completed' ? (
                          <div className="my-1 ml-1 h-px bg-[var(--color-border)]" aria-hidden />
                        ) : null}
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => onStatusChange(option.key)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[var(--color-hover)]',
                            selected
                              ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent)]'
                              : 'text-[var(--color-text-muted)]',
                            STATUS_SUB_OPTIONS.has(option.key) && 'pl-5',
                          )}
                        >
                          {dot ? (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: dot }}
                              aria-hidden
                            />
                          ) : (
                            <span className="h-2 w-2 shrink-0" aria-hidden />
                          )}
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          <span className="shrink-0 text-[11px] tabular-nums opacity-60">
                            {statuses[option.key]}
                          </span>
                          <Check
                            className={cn(
                              'h-3.5 w-3.5 shrink-0',
                              selected ? 'opacity-100' : 'opacity-0',
                            )}
                            aria-hidden
                          />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* Between the status ladder and the tags, because a folder and a tag are the same
                    kind of question — which subset of the listing — where type and status are
                    questions about each note on its own. */}
                {showFolders ? (
                  <>
                    <SectionLabel>Folder</SectionLabel>
                    <div role="radiogroup" aria-label="Filter by folder">
                      {[null, ...(folders ?? [])].map((option) => {
                        const id = option === null ? null : option.id
                        const selected = folder === id || (option === null && folderName === null)
                        return (
                          <button
                            key={id ?? '__all__'}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            // Clicking the folder already chosen clears it, the way a tag does —
                            // it is the same gesture and should have the same effect.
                            onClick={() => onFolderChange?.(folder === id ? null : id)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[var(--color-hover)]',
                              selected
                                ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent)]'
                                : 'text-[var(--color-text-muted)]',
                            )}
                          >
                            {option === null ? (
                              <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            ) : (
                              <FolderClosed
                                className="h-3.5 w-3.5 shrink-0 opacity-60"
                                strokeWidth={1.8}
                                aria-hidden
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">
                                {option === null ? 'All folders' : option.name}
                              </span>
                              {/* Only where it says something. Two folders can share a name in
                                  different parts of the tree, and a root folder's trail is just
                                  "Notes", which is every folder's trail. */}
                              {option !== null && option.trail ? (
                                <span className="block truncate text-[10.5px] font-normal opacity-70">
                                  {option.trail}
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums opacity-60">
                              {option === null ? tasks.length : option.count}
                            </span>
                            <Check
                              className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                selected ? 'opacity-100' : 'opacity-0',
                              )}
                              aria-hidden
                            />
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : null}

                {showTags ? (
                  <>
                    <SectionLabel>Tags</SectionLabel>
                    <div className="flex flex-wrap gap-1 px-0.5">
                      <button
                        type="button"
                        aria-pressed={tag === null}
                        onClick={() => onTagChange?.(null)}
                        className={cn(
                          'anim-press rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-colors',
                          tag === null
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                            : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
                        )}
                      >
                        All
                      </button>
                      {tags?.map((item) => (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={tag === item}
                          onClick={() => onTagChange?.(tag === item ? null : item)}
                          className={cn(
                            'anim-press inline-flex max-w-full items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-colors',
                            tag === item
                              ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                              : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]',
                          )}
                        >
                          <Hash className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />
                          <span className="truncate">{item}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
