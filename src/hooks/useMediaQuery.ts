import { useEffect, useState } from 'react'

/** Live `matchMedia` result for a CSS media query. Tailwind breakpoints handle styling; this is
 *  for the cases where a breakpoint has to change *layout logic* (measuring, positioning) that
 *  CSS classes alone can't express. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const list = window.matchMedia(query)
    setMatches(list.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Below Tailwind's `lg` breakpoint — phones through small tablets, i.e. every width where the
 *  app runs its compact layout instead of the desktop sidebar one. */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1023px)')
}
