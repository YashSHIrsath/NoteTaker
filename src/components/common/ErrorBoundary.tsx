import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '../ui/Button'

export interface ErrorBoundaryProps {
  children: ReactNode
  /**
   * Changes to this value clear the error and try rendering again.
   *
   * The page boundary passes the pathname, so navigating away from a screen that threw is enough
   * to leave it behind — otherwise the error card would follow you around the app, since a boundary
   * that has caught stays caught until something resets it.
   */
  resetKey?: string
  /** What failed, in the card's heading. "This page" for the page boundary, the app for the root. */
  scope?: string
}

interface ErrorBoundaryState {
  error: Error | null
  /** The `resetKey` the current error belongs to, so a change to it can be noticed during render. */
  key: string | undefined
}

/**
 * Stops a render error from emptying the screen.
 *
 * React unmounts the entire tree when a render throws and nothing catches it, so a single bad
 * value anywhere in the app leaves a blank page — no header, no navigation, nothing to press, and
 * on a phone no console to find out why. That is indistinguishable, to the person holding it, from
 * the app having died.
 *
 * A class component because this is the one thing hooks cannot do: `getDerivedStateFromError` and
 * `componentDidCatch` have no function-component equivalent.
 *
 * Two of these are mounted. The page-level one keeps the header and the bottom bar alive so you can
 * navigate out of a screen that failed, which is nearly always enough to keep working. The root one
 * is the backstop for anything above that — a provider, the router itself — and can only offer a
 * reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, key: undefined }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (state.error && state.key !== undefined && state.key !== props.resetKey) {
      return { error: null, key: props.resetKey }
    }
    if (!state.error) {
      return { key: props.resetKey }
    }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The component stack is the part that says *where*, and it exists only here — it is not on the
    // error itself. Worth logging even though nobody is watching a phone's console: a desktop
    // reproduction of the same bug then costs one glance instead of a bisect.
    console.error('Render failed', error, info.componentStack)
  }

  private retry = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) {
      return this.props.children
    }

    const scope = this.props.scope ?? 'This page'

    return (
      <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-4 bg-[var(--color-surface)] px-6 py-10 text-center">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-surface-muted)] text-[var(--color-danger)]">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </span>

        <div className="flex max-w-md flex-col gap-1.5">
          <p
            className="text-[16px] font-semibold tracking-tight text-[var(--color-text)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {scope} stopped working
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--color-text-muted)]">
            Nothing you had saved is affected — this is the screen failing to draw, not your notes.
          </p>
          {/* The message itself, not hidden behind a console nobody has on a phone. It is the only
            * thing that makes a report of this actionable. */}
          <p className="mt-1 break-words rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-left font-mono text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
            {error.message || String(error)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="subtle" onClick={this.retry}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
            Reload the app
          </Button>
        </div>
      </div>
    )
  }
}
