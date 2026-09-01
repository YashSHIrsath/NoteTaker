import {
  CUSTOM_DEFAULT,
  CUSTOM_VAR_NAMES,
  DEFAULT_DARK,
  DEFAULT_LIGHT,
  THEMES,
  customThemeVars,
  isDarkGround,
  isDarkTheme,
  readCustomColors,
  themeFamily,
  writeCustomColors,
  nextTheme,
  quickThemes,
  readQuickThemes,
  readTheme,
  themeOption,
  writeQuickThemes,
  type ThemeId,
} from '../../lib/themes'

/**
 * The theme catalogue, and the two questions the app asks it.
 *
 * Everything here was a two-value problem until there were five themes. `theme === 'dark'` was the
 * question six different places asked, and three of the five themes are dark — so the checks that
 * matter most are the ones that pin the *family*, not the id.
 */

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const HEX = /^#[0-9a-f]{6}$/

/** Every theme is complete, and no two of them draw the same chip. */
function checkCatalogue(): void {
  const ids = THEMES.map((theme) => theme.id)
  assert(new Set(ids).size === ids.length, 'no two themes share an id')
  assert(THEMES.length >= 2, 'there is something to choose between')

  for (const theme of THEMES) {
    assert(theme.label.length > 0, `${theme.id} has a name`)
    assert(theme.hint.length > 0, `${theme.id} says what it is`)
    for (const [role, value] of Object.entries(theme.swatch)) {
      assert(HEX.test(value), `${theme.id}'s ${role} is a plain 6-digit hex the picker can paint`)
    }
  }

  // The swatch values are copied out of index.css by hand — see the note on ThemeOption — so the
  // one failure mode worth pinning is two themes that have quietly converged into the same chip.
  const chips = THEMES.map((theme) => Object.values(theme.swatch).join('/'))
  assert(new Set(chips).size === chips.length, 'no two themes render as the same swatch')

  // The same argument as the swatches, for the glyph the triggers draw. Two themes sharing an icon
  // is the exact bug the icons were added to fix: a button that looks identical in two themes reads
  // as a button that did nothing when you pressed it.
  const glyphs = THEMES.map((theme) => theme.icon)
  assert(new Set(glyphs).size === glyphs.length, 'no two themes draw the same icon')

  assert(
    THEMES.some((theme) => theme.dark) && THEMES.some((theme) => !theme.dark),
    'both families exist, or the light/dark split has nothing to describe',
  )
  assert(
    THEMES.filter((theme) => theme.family === 'signature').length >= 1,
    'the app has at least one theme of its own',
  )
}

/** Resolution never fails. A hand-edited or older stored value must not leave the app themeless. */
function checkResolution(): void {
  assert(themeOption('studio').id === 'studio', 'a known id resolves to itself')
  assert(themeOption('not-a-theme').id === DEFAULT_LIGHT, 'an unknown id falls back')
  assert(themeOption(null).id === DEFAULT_LIGHT, 'and so does nothing at all')

  assert(readTheme('indigo', false) === 'indigo', 'a stored choice wins over the system')
  assert(readTheme(null, true) === DEFAULT_DARK, 'no choice follows the system, dark')
  assert(readTheme(null, false) === DEFAULT_LIGHT, 'and light')
  assert(readTheme('mono', true) === DEFAULT_DARK, 'a value from an older build is not honoured')
}

/**
 * The family question, which is the one that used to be `theme === 'dark'`.
 *
 * Six places read it: the note palette's selector in index.css, the native status bar, the space
 * tint's weight, the two BlockNote surfaces and the switcher's own icon. Getting it wrong for
 * Studio would have put black status-bar icons on a near-black header.
 */
function checkFamilies(): void {
  assert(isDarkTheme('dark'), 'dark is dark')
  assert(isDarkTheme('studio'), 'and so is Studio')
  assert(isDarkTheme('indigo'), 'and Indigo')
  assert(!isDarkTheme('light'), 'light is not')
  assert(!isDarkTheme('paper'), 'and neither is Paper — its chrome is warm, not dim')
  assert(!isDarkTheme('nonsense'), 'an unknown theme is treated as light, which is the safe half')
}

/**
 * The custom theme is one id with two answers, and the answer comes from the ground.
 *
 * This is the check the whole feature hangs off. `data-theme-family` is what index.css keys the note
 * palette on, so getting it wrong for a pale custom ground means near-black cards on a pale page —
 * and nothing throws, the notes are simply unreadable.
 */
function checkCustomFamily(): void {
  assert(isDarkGround('#1a0b33'), 'the grape-soda default is a dark room')
  assert(isDarkGround('#000000'), 'and so is black')
  assert(!isDarkGround('#ffffff'), 'white is not')
  assert(!isDarkGround('#faf6ef'), 'nor is oat')
  assert(isDarkGround('not-a-colour'), 'and a malformed ground is read as dark, which is where the defaults live')

  assert(
    themeFamily('custom', { ground: '#1a0b33', accent: '#3ff0d0' }) === 'dark',
    'a dark custom ground puts the theme in the dark family',
  )
  assert(
    themeFamily('custom', { ground: '#fff8e7', accent: '#c2410c' }) === 'light',
    'and a pale one puts it in the light family, whatever the accent is',
  )
  assert(themeFamily('studio', CUSTOM_DEFAULT) === 'dark', 'a fixed theme ignores the custom colours')
  assert(themeFamily('paper', CUSTOM_DEFAULT) === 'light', 'in both directions')
}

/** Two colours in, a whole theme out — and nothing malformed survives the trip. */
function checkCustomColours(): void {
  assert(
    readCustomColors(null).ground === CUSTOM_DEFAULT.ground,
    'nothing stored is the funky default',
  )
  assert(readCustomColors('not json').accent === CUSTOM_DEFAULT.accent, 'and so is nonsense')
  assert(
    readCustomColors('{"ground":"#112233"}').accent === CUSTOM_DEFAULT.accent,
    'a half-written value costs one colour, not the theme',
  )
  assert(
    readCustomColors('{"ground":"red","accent":"#ABCDEF"}').ground === CUSTOM_DEFAULT.ground,
    'a colour the picker could not have produced is refused',
  )
  assert(
    readCustomColors('{"ground":"#ABCDEF","accent":"#123456"}').ground === '#abcdef',
    'and a good one is kept, lower-cased so the settings screen and storage agree',
  )

  const round = writeCustomColors({ ground: '#123456', accent: '#654321' })
  assert(readCustomColors(round).ground === '#123456', 'a save and a read agree')

  const vars = customThemeVars({ ground: '#1a0b33', accent: '#3ff0d0' })
  assert(vars['--surface-muted-base'] === '#1a0b33', 'the page is the colour that was picked')
  assert(vars['--color-accent'] === '#3ff0d0', 'and the accent is used as given')
  assert(
    Object.values(vars).every((value) => value.length > 0),
    'every derived value resolves to something',
  )
  // Which way "away from the page" points is the entire difference between the two families.
  assert(
    customThemeVars({ ground: '#1a0b33', accent: '#3ff0d0' })['--color-text']!.includes('#ffffff'),
    'a dark page lifts its type toward white',
  )
  assert(
    !customThemeVars({ ground: '#fff8e7', accent: '#c2410c' })['--color-text']!.includes('#ffffff'),
    'and a light page pushes it the other way',
  )

  // Every property set has to be one the provider knows to clear again, or a custom ground leaks
  // into whatever theme is chosen next.
  assert(
    Object.keys(vars).every((name) => CUSTOM_VAR_NAMES.includes(name)),
    'nothing is set that would be left behind on the way out',
  )
  assert(
    CUSTOM_VAR_NAMES.every((name) => name.startsWith('--')),
    'and the list is custom properties rather than anything else',
  )
}

/**
 * The shortlist: nothing stored means all of them, and an empty list means empty.
 *
 * Those two have to be different or unchecking the last theme would helpfully re-check everything,
 * which is a setting that refuses to be set.
 */
function checkShortlist(): void {
  const all = THEMES.map((theme) => theme.id)
  assert(readQuickThemes(null).join(',') === all.join(','), 'nothing stored offers every theme')
  assert(readQuickThemes('').length === 0, 'an empty list stays empty rather than resetting to all')

  assert(
    readQuickThemes('indigo,light').join(',') === 'light,indigo',
    'the stored order does not matter — the result is catalogue order, so the strip and the settings list agree',
  )
  assert(
    readQuickThemes('light,nonsense,studio').join(',') === 'light,studio',
    'an id from another build is dropped rather than rendered as a blank chip',
  )
  assert(
    readQuickThemes('light,light,light').join(',') === 'light',
    'and a duplicate is one chip',
  )

  const round = writeQuickThemes(['studio', 'paper'])
  assert(readQuickThemes(round).join(',') === 'paper,studio', 'a save and a read agree')
}

/** The strip always contains the theme in force, even when it has been unchecked — otherwise it
 *  would be the one theme you could see and not leave. */
function checkStripHoldsTheCurrentTheme(): void {
  const shown = quickThemes(['light', 'dark'], 'indigo').map((theme) => theme.id)
  assert(shown.includes('indigo'), 'an unchecked current theme is still shown')
  assert(shown.join(',') === 'light,dark,indigo', 'and in catalogue order with the rest')

  const none = quickThemes([], 'paper').map((theme) => theme.id)
  assert(none.join(',') === 'paper', 'with nothing checked the strip is just where you are')
}

/** Cycling always moves, and never gets stuck — including when the shortlist is too small to cycle
 *  within, which is what keeps the landing bar's button and the command palette alive. */
function checkCycle(): void {
  const quick: ThemeId[] = ['light', 'studio', 'indigo']
  assert(nextTheme(quick, 'light') === 'studio', 'it steps along the shortlist')
  assert(nextTheme(quick, 'indigo') === 'light', 'and wraps at the end')

  assert(nextTheme([], 'light') !== 'light', 'an empty shortlist falls back to the whole catalogue')
  assert(nextTheme(['paper'], 'paper') !== 'paper', 'and so does a shortlist of one')

  // Walk the whole catalogue from every starting point: a cycle must visit everything and come home.
  const all = THEMES.map((theme) => theme.id)
  for (const start of all) {
    const seen = new Set<ThemeId>()
    let at = start
    for (let step = 0; step < all.length; step += 1) {
      assert(!seen.has(at), `the cycle from ${start} does not repeat before visiting everything`)
      seen.add(at)
      at = nextTheme(all, at)
    }
    assert(seen.size === all.length, `the cycle from ${start} reaches every theme`)
    assert(at === start, `and returns to ${start}`)
  }
}

export function runThemeChecks(): void {
  checkCatalogue()
  checkResolution()
  checkFamilies()
  checkCustomFamily()
  checkCustomColours()
  checkShortlist()
  checkStripHoldsTheCurrentTheme()
  checkCycle()
}
