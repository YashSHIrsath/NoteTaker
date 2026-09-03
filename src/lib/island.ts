/**
 * The chrome that turns a region of the shell into an island.
 *
 * From `lg` the app reads as a set of panels floating on a recessed ground — the sidebar, the
 * header, the page, and the folder view's subfolder panel — rather than as one surface carved up
 * by rules. Below `lg` there is no sidebar and the page headers already float over their content,
 * so the treatment starts at the same breakpoint the sidebar does and the compact layout is left
 * exactly as it was.
 *
 * `lg:border` rather than a per-side width on purpose: every piece this is applied to carries a
 * single dividing rule of its own (`border-r` on the sidebar, `border-b` on the header, `border-l`
 * on the subfolder panel) which has to become a full outline once the piece is separated from its
 * neighbours. A rule inside a media query wins over a plain one whatever order the classes are
 * written in, so the callers keep their compact borders untouched.
 *
 * Deliberately no `overflow-hidden`: the menus these islands open — task filters, folder actions,
 * the workspace switcher — hang outside their own island, and clipping them would be a far worse
 * bug than a square corner sitting behind content that is inset from it anyway.
 */
export const ISLAND_CLASS = [
  'lg:rounded-2xl lg:border lg:border-[var(--color-border)]',
  'lg:bg-[var(--color-surface)] lg:shadow-[var(--shadow-sm)]',
].join(' ')

/**
 * The one gap between islands, and between an island and the window edge.
 *
 * Small enough to spend the width on content, wide enough to read as a deliberate separation
 * rather than as a seam — and the same value in both places, because an island sitting a
 * different distance from its neighbour than from the edge reads as a mistake, not as a
 * tighter gap.
 */
export const ISLAND_GAP = 'lg:gap-2.5'
