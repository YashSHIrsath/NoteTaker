import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { revealThemeChange, type RevealOrigin } from '../lib/themeReveal'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'mynotes-theme'

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : getSystemTheme()
}

interface ThemeContextValue {
  theme: Theme
  /** `origin` is where the reveal circle grows from — pass the toggle's own position so the new
   *  theme looks like it spreads out of the control that was pressed. Defaults to screen centre. */
  toggleTheme: (origin?: RevealOrigin) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Native only: the app draws behind the status bar (Android 15 enforces edge-to-edge), so the
  // system icons sit on our own header. Their color is a system setting, not CSS — without this
  // the light theme gets white icons on a white header, i.e. an invisible clock. Style.Dark means
  // "dark background, light icons", so it follows the theme rather than opposing it.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { Capacitor } = await import('@capacitor/core')
      if (cancelled || !Capacitor.isNativePlatform()) {
        return
      }
      const { StatusBar, Style } = await import('@capacitor/status-bar')
      await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }).catch(() => undefined)
    })()
    return () => {
      cancelled = true
    }
  }, [theme])

  const toggleTheme = (origin?: RevealOrigin) => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    window.localStorage.setItem(STORAGE_KEY, next)
    revealThemeChange(() => {
      // Both, and in this order: the attribute is what the CSS variables hang off, and it has to
      // be visibly changed *inside* the transition callback. flushSync then commits the React
      // tree in the same beat, so components that branch on the theme (the toggle's own icon)
      // land in the snapshot the reveal uncovers rather than popping in afterwards.
      document.documentElement.dataset.theme = next
      flushSync(() => setTheme(next))
    }, origin)
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider.')
  }
  return value
}
