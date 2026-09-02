import {
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_FONT,
  DEFAULT_NOTE_FONT,
  FONT_GROUPS,
  FONT_OPTIONS,
  fontFor,
  fontUpdate,
  fontsFor,
  groupedFontsFor,
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
    // Tested at the *end* of the stack rather than anywhere in it, which is what the message has
    // always claimed and what actually matters: a generic in the middle is not a last resort.
    // `cursive` joined the list with the handwriting faces — see HAND_FALLBACK.
    assert(
      /(?:^|,)\s*(?:serif|sans-serif|monospace|cursive|system-ui)\s*$/.test(option.stack),
      `${option.id} ends in a generic family, so it always resolves to something`,
    )
    if (option.google) {
      // The API takes '+' for spaces; a raw space would produce a 400 and a silently unstyled app.
      assert(!option.google.includes(' '), `${option.id} escapes spaces in its family name`)
      assert(
        option.google.startsWith(option.label.replace(/ /g, '+').split(':')[0]!.slice(0, 4)),
        `${option.id}'s request names the family in its label`,
      )
      /*
       * The family requested is the family the stack asks for, exactly.
       *
       * The check above compares the request to the *label*, which is a different mistake. This one
       * catches the expensive typo: a stack naming "Indie Flower" while the request fetches
       * "Indy+Flower" downloads a face nothing references and renders the app in Comic Sans, with a
       * 200 from Google and no error anywhere.
       */
      const family = option.google.split(':')[0]!.replace(/\+/g, ' ')
      assert(
        option.stack.startsWith(`"${family}"`),
        `${option.id} requests the same family its stack leads with (${family})`,
      )
    }
  }

  const body = fontsFor('body')
  const heading = fontsFor('heading')
  const note = fontsFor('note')
  assert(body.length >= 10, `at least ten interface faces (${body.length})`)
  assert(heading.length >= 10, `at least ten heading faces (${heading.length})`)
  assert(note.length >= 10, `at least ten note faces (${note.length})`)

  /*
   * Every interface face is also offered for notes, and this is load-bearing rather than tidy.
   *
   * An account with no note face set follows its interface face (see readFontChoice). If some face
   * were offered for `body` and not for `note`, choosing it would silently drop the note text back to
   * the floor default — the app in one face and the notes in another, with nothing on screen
   * explaining why.
   */
  for (const option of body) {
    assert(
      option.roles.includes('note'),
      `${option.id} is offered for the interface, so it must be offered for notes — the note face falls back to it`,
    )
  }

  // The defaults ship in index.html, so they must be the ones that ask for nothing at runtime —
  // otherwise a cold start would render in a fallback until a stylesheet arrived.
  assert(fontFor('body', DEFAULT_BODY_FONT).google === null, 'the default interface face is preloaded')
  assert(
    fontFor('heading', DEFAULT_HEADING_FONT).google === null,
    'and so is the default heading face',
  )
  assert(fontFor('note', DEFAULT_NOTE_FONT).google === null, 'and so is the note floor')
}

/**
 * The grouping the picker draws.
 *
 * Every face lands in exactly one section, and no face is stranded outside one — a tile that belongs
 * to no group simply would not render, which is a font that exists in the catalogue and cannot be
 * chosen from the UI.
 */
function checkGrouping(): void {
  const known = new Set(FONT_GROUPS.map((group) => group.id))
  for (const option of FONT_OPTIONS) {
    assert(known.has(option.group), `${option.id} is in a group the picker knows about`)
  }

  for (const role of ['body', 'heading', 'note'] as const) {
    const flat = fontsFor(role)
    const grouped = groupedFontsFor(role).flatMap((group) => group.options)
    assert(
      grouped.length === flat.length,
      `every ${role} face appears in exactly one group (${grouped.length} of ${flat.length})`,
    )
    assert(
      new Set(grouped.map((option) => option.id)).size === grouped.length,
      `no ${role} face is listed in two groups`,
    )
    for (const group of groupedFontsFor(role)) {
      assert(group.options.length > 0, `the ${group.id} section is not drawn empty for ${role}`)
    }
  }

  // Handwriting is the reason the grouping exists, so it is worth asserting there is a real set of
  // them rather than a section with two entries in it.
  const hands = FONT_OPTIONS.filter((option) => option.group === 'handwriting')
  assert(hands.length >= 12, `a real handwriting section (${hands.length})`)
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

/**
 * The note face, which follows the interface face until it is set.
 *
 * This is the behaviour the whole third role turns on: somebody who sets the app to a handwriting
 * face expects their notes to be handwritten, and should not have to find a second setting to finish
 * the job. An independent default would leave the notes in Inter and give no clue why.
 */
function checkNoteFollowsBody(): void {
  assert(
    readFontChoice('note', undefined).id === DEFAULT_NOTE_FONT,
    'no account at all lands on the floor',
  )
  assert(
    readFontChoice('note', {}).id === DEFAULT_NOTE_FONT,
    'and so does an account that has chosen nothing',
  )

  // The case that matters: one choice, both faces.
  assert(
    readFontChoice('note', fontUpdate('body', 'kalam')).id === 'kalam',
    'choosing an interface face sets the note face with it',
  )
  assert(
    readFontChoice('note', fontUpdate('body', 'lora')).id === 'lora',
    'whatever that face is',
  )

  // And an explicit note choice overrides it, in both directions.
  const both = { ...fontUpdate('body', 'inter'), ...fontUpdate('note', 'caveat') }
  assert(readFontChoice('note', both).id === 'caveat', 'an explicit note face wins')
  assert(readFontChoice('body', both).id === 'inter', 'and does not disturb the interface face')

  /*
   * A note face that is not offered for notes falls back to the interface face rather than to the
   * floor. Reachable from a hand-edited preference, and from a build where a face was withdrawn from
   * the note list — in which case following the interface is much closer to what the account asked
   * for than resetting to Inter.
   */
  const stale = { ...fontUpdate('body', 'lora'), note_font: 'permanent-marker' }
  assert(
    readFontChoice('note', stale).id === 'lora',
    'a note id that is no longer offered for notes follows the interface face',
  )
  assert(
    readFontChoice('note', { ...fontUpdate('body', 'lora'), note_font: 'not-a-font' }).id === 'lora',
    'and so does an id that never existed',
  )
}

export function runFontChecks(): void {
  checkCatalogue()
  checkGrouping()
  checkResolution()
  checkStorage()
  checkNoteFollowsBody()
}
