import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { revealThemeChange, type RevealOrigin } from '../lib/themeReveal'
import {
  CUSTOM_VAR_NAMES,
  customThemeVars,
  nextTheme,
  readCustomColors,
  readQuickThemes,
  readTheme,
  themeFamily,
  writeCustomColors,
  writeQuickThemes,
  type CustomColors,
  type ThemeId,
} from '../lib/themes'

const STORAGE_KEY = 'mynotes-theme'
/** Which themes the header's switcher offers. Separate from the choice itself, because forgetting
 *  one must not forget the other. */
const QUICK_KEY = 'mynotes-theme-quick'
/** The two colours the custom theme is built from. */
const CUSTOM_KEY = 'mynotes-theme-custom'

function getSystemTheme(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface ThemeContextValue {
  theme: ThemeId
  /** Whether the theme in force is a dark one. Read this rather than comparing to 'dark' — there
   *  are three dark themes now, and only one of them is called that. */
  isDark: boolean
  /**
   * Switches to a named theme.
   *
   * `origin` is where the reveal circle grows from — pass the pressed control's own position so the
   * new theme looks like it spreads out of it. Defaults to screen centre.
   */
  setTheme: (next: ThemeId, origin?: RevealOrigin) => void
  /** The next theme along, for controls that cycle rather than pick — the landing bar's button and
   *  the command palette. */
  toggleTheme: (origin?: RevealOrigin) => void
  /** The themes the switcher offers, in catalogue order. */
  quickThemeIds: ThemeId[]
  setQuickThemeIds: (next: ThemeId[]) => void
  /** The two colours the custom theme is built from — see customThemeVars. */
  customColors: CustomColors
  setCustomColors: (next: CustomColors) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * The theme in force, and which themes the header offers.
 *
 * Both are per-device rather than per-account, and deliberately: which room you want is a fact about
 * the screen in front of you — a bright office, a dark bedroom — not about who you are. It is the
 * same reason "tiles per row" is stored per screen size while the note style follows the account.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() =>
    readTheme(window.localStorage.getItem(STORAGE_KEY), getSystemTheme()),
  )
  const [quickThemeIds, setQuickState] = useState<ThemeId[]>(() =>
    readQuickThemes(window.localStorage.getItem(QUICK_KEY)),
  )
  const [customColors, setCustomState] = useState<CustomColors>(() =>
    readCustomColors(window.localStorage.getItem(CUSTOM_KEY)),
  )
  const family = themeFamily(theme, customColors)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // The second attribute is what index.css keys the note palette off. It exists because `custom`
    // is one theme id with two possible answers — a pale ground makes it a light theme — and a
    // selector listing theme ids could never work that out.
    document.documentElement.dataset.themeFamily = family
  }, [family, theme])

  /*
   * The custom theme's colours, written over its defaults as inline custom properties on <html>.
   *
   * Inline rather than a stylesheet, for the same reason a chosen font is (see useAppFonts): these
   * are values from storage, not from the build, and <html> is the one element every portalled
   * dialog and menu still inherits from.
   *
   * Cleared whenever the theme is anything else. A stale ground left behind would not sit there
   * quietly — `--surface-base` is read by every other theme too, so Studio would come out purple.
   */
  useEffect(() => {
    const root = document.documentElement
    if (theme !== 'custom') {
      for (const name of CUSTOM_VAR_NAMES) {
        root.style.removeProperty(name)
      }
      return
    }
    for (const [name, value] of Object.entries(customThemeVars(customColors))) {
      root.style.setProperty(name, value)
    }
  }, [customColors, theme])

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
      await StatusBar.setStyle({
        // "Is this theme dark", not "is this theme *the* dark one" — Studio and Indigo are dark too,
        // and asking the narrower question left them with black icons on a near-black header.
        style: family === 'dark' ? Style.Dark : Style.Light,
      }).catch(() => undefined)
    })()
    return () => {
      cancelled = true
    }
  }, [family])

  const setTheme = (next: ThemeId, origin?: RevealOrigin) => {
    if (next === theme) {
      return
    }
    window.localStorage.setItem(STORAGE_KEY, next)
    revealThemeChange(() => {
      // Both, and in this order: the attribute is what the CSS variables hang off, and it has to
      // be visibly changed *inside* the transition callback. flushSync then commits the React
      // tree in the same beat, so components that branch on the theme (the switcher's own marks)
      // land in the snapshot the reveal uncovers rather than popping in afterwards.
      document.documentElement.dataset.theme = next
      flushSync(() => setThemeState(next))
    }, origin)
  }

  const setCustomColors = (next: CustomColors) => {
    const cleaned = writeCustomColors(next)
    window.localStorage.setItem(CUSTOM_KEY, cleaned)
    setCustomState(readCustomColors(cleaned))
  }

  const setQuickThemeIds = (next: ThemeId[]) => {
    const cleaned = writeQuickThemes(next)
    window.localStorage.setItem(QUICK_KEY, cleaned)
    setQuickState(readQuickThemes(cleaned))
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        // The custom theme's family follows the ground somebody picked, so this is not the same
        // question as "is the theme called dark" for one theme in six.
        isDark: family === 'dark',
        setTheme,
        toggleTheme: (origin) => setTheme(nextTheme(quickThemeIds, theme), origin),
        quickThemeIds,
        setQuickThemeIds,
        customColors,
        setCustomColors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider.')
  }
  return value
}
