import { useEffect, useRef, useState } from 'react'

const POP_MS = 240

/**
 * True for one animation's length after `value` changes — for a control whose icon should
 * acknowledge the click in every direction: star on and off, pin on and off, or each step of a
 * status cycle (hence any comparable value, not just a boolean).
 *
 * The first render never animates: a list of already-starred rows shouldn't pop on arrival.
 */
export function useToggleFeedback(value: unknown): boolean {
  const previous = useRef(value)
  const [popping, setPopping] = useState(false)

  useEffect(() => {
    if (previous.current === value) {
      return
    }
    previous.current = value
    setPopping(true)
    const timer = window.setTimeout(() => setPopping(false), POP_MS)
    return () => window.clearTimeout(timer)
  }, [value])

  return popping
}
