import {
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_FONT,
  FONT_OPTIONS,
  fontFor,
  fontUpdate,
  fontsFor,
  readFontChoice,
} from '../../lib/fonts'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * The catalogue itself: every entry usable, no duplicates, both roles populated.
 *
 * A face with no fallbacks or an unloadable family is the one bug here that cannot be seen in a
 * screenshot — it renders in the browser's last-resort face, which on some platforms looks close
 * enough to a real choice to ship.
 */
function checkCatalogue(): void {
  const ids = FONT_OPTIONS.map((option) => option.id)
  assert(new Set(ids).size === ids.length, 'no two faces share an id')

  for (const option of FONT_OPTIONS) {
    assert(option.label.length > 0, `${option.id} has a name`)
    assert(option.hint.length > 0, `${option.id} says what it is for`)
    assert(option.roles.length > 0, `${option.id} is offered for at least one role`)
    // A quoted family and then at least one fallback: a stack of one is a stack that fails silently
    // the moment the request to Google Fonts does.
    assert(option.stack.includes('"'), `${option.id} names its family in quotes`)
    assert(option.stack.includes(','), `${option.id} has a fallback behind it`)
    assert(
      /serif|sans-serif|monospace/.test(option.stack),
      `${option.id} ends in a generic family, so it always resolves to something`,
    )
    if (option.google) {
      // The API takes '+' for spaces; a raw space would produce a 400 and a silently unstyled app.
      assert(!option.google.includes(' '), `${option.id} escapes spaces in its family name`)
      assert(
        option.google.startsWith(option.label.replace(/ /g, '+').split(':')[0]!.slice(0, 4)),
        `${option.id}'s request names the family in its label`,
      )
    }
  }

  const body = fontsFor('body')
  const heading = fontsFor('heading')
  assert(body.length >= 10, `at least ten reading faces (${body.length})`)
  assert(heading.length >= 10, `at least ten heading faces (${heading.length})`)

  // The two defaults ship in index.html, so they must be the two that ask for nothing at runtime —
  // otherwise a cold start would render in a fallback until a stylesheet arrived.
  assert(fontFor('body', DEFAULT_BODY_FONT).google === null, 'the default reading face is preloaded')
  assert(
    fontFor('heading', DEFAULT_HEADING_FONT).google === null,
    'and so is the default heading face',
  )
}

/**
 * Resolution never fails, and never crosses roles.
 *
 * Both matter. A hand-edited or stale id must not leave the app with no face at all; and a display
 * face resolved into the *body* slot would set every 11px label in something drawn for 48px, which
 * is the worst outcome available here.
 */
function checkResolution(): void {
  assert(fontFor('body', undefined).id === DEFAULT_BODY_FONT, 'no choice is the default')
  assert(fontFor('body', 'not-a-font').id === DEFAULT_BODY_FONT, 'an unknown id falls back')
  assert(fontFor('heading', 'not-a-font').id === DEFAULT_HEADING_FONT, 'in either role')

  // Playfair is heading-only; asking for it as a reading face must be refused, not honoured.
  assert(
    fontFor('body', 'playfair').id === DEFAULT_BODY_FONT,
    'a heading-only face cannot be resolved into the reading slot',
  )
  assert(fontFor('heading', 'playfair').id === 'playfair', 'but is honoured in its own')
  // And the reverse.
  assert(
    fontFor('heading', 'jetbrains-mono').id === DEFAULT_HEADING_FONT,
    'a reading-only face cannot be resolved into the heading slot',
  )

  for (const option of FONT_OPTIONS) {
    for (const role of option.roles) {
      assert(fontFor(role, option.id).id === option.id, `${option.id} resolves in its ${role} role`)
    }
  }
}

/** Reading and writing agree, and the values the two-option version stored still mean something. */
function checkStorage(): void {
  for (const option of FONT_OPTIONS) {
    for (const role of option.roles) {
      const patch = fontUpdate(role, option.id)
      assert(
        readFontChoice(role, patch).id === option.id,
        `${option.id} survives a save and a read as a ${role} face`,
      )
      assert(Object.keys(patch).length === 1, 'a save touches one key')
    }
  }

  // Each role has its own key, so choosing a heading face must not disturb the reading one.
  const both = { ...fontUpdate('body', 'manrope'), ...fontUpdate('heading', 'fraunces') }
  assert(readFontChoice('body', both).id === 'manrope', 'the two roles are stored separately')
  assert(readFontChoice('heading', both).id === 'fraunces', 'and neither overwrites the other')

  /*
   * The values the two-option version wrote.
   *
   * It stored 'mono' and 'sans' under the same key this now stores an id under. Discarding them would
   * silently reset the preference of everybody who set one before the list existed, which is a small
   * betrayal that is very hard to notice from the inside.
   */
  assert(
    readFontChoice('body', { body_font: 'mono' }).id === 'jetbrains-mono',
    'the old “mono” choice still means JetBrains Mono',
  )
  assert(
    readFontChoice('body', { body_font: 'sans' }).id === DEFAULT_BODY_FONT,
    'and the old “sans” choice still means Inter',
  )

  assert(readFontChoice('body', undefined).id === DEFAULT_BODY_FONT, 'no session, no surprise')
  assert(readFontChoice('heading', {}).id === DEFAULT_HEADING_FONT, 'nor an empty account')
  assert(
    readFontChoice('body', { body_font: 42 }).id === DEFAULT_BODY_FONT,
    'nor a value of the wrong type entirely',
  )
}

export function runFontChecks(): void {
  checkCatalogue()
  checkResolution()
  checkStorage()
}
