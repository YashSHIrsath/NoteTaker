import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_NAV_ORDER,
  defaultPageUpdate,
  NAV_DESTINATIONS,
  navIdForPath,
  readDefaultPage,
  readNavOrder,
} from '../../lib/navOrder'
import { clearPendingInvite, readPendingInvite, stashPendingInvite } from '../../lib/pendingInvite'
import { spaceAccentStyle, spaceColorFor, SPACE_COLORS } from '../../lib/spaceColor'
import { roleCanManageMembers, roleCanWrite, ROLE_LABELS } from '../../lib/spaceRoles'
import { SupabaseSpacesDataRepository } from '../../repositories/supabase/supabaseSpacesRepository'
import { INVITABLE_ROLES, SPACE_ROLES, type SpaceRole } from '../../types'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const SPACE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SPACE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

/* ------------------------------------------------------------------ mock client
 *
 * Narrow on purpose: enough to see what the repository sends and what it makes of what comes back.
 * The rules themselves live in SQL and are checked in supabase/tests.
 */

interface RpcCall {
  name: string
  args: Record<string, unknown> | undefined
}

interface FunctionCall {
  name: string
  body: Record<string, unknown> | undefined
}

interface SpacesMock {
  rpcs: RpcCall[]
  /** Edge Function invocations — the invitation mail is the only one so far. Named apart from the
   *  client's own `functions`, which is the API being recorded rather than the recording. */
  functionCalls: FunctionCall[]
  updates: Array<{ table: string; row: Record<string, unknown> }>
  deletes: string[]
  /** Whether a read scoped itself is only visible in the query it sent, never in the result. */
  filters: Array<{ column: string; value: unknown }>
}

function createSpacesMock(options: {
  rpc?: Record<string, unknown>
  tables?: Record<string, unknown>
  /** Rows a delete or update reports back, so "did that actually happen" can be exercised. */
  affected?: Array<{ user_id: string }>
  /** What the mail function answers. An error stands in for a mailbox being down. */
  invokeResult?: { data: unknown; error: unknown }
}): SupabaseClient {
  const rpcs: RpcCall[] = []
  const functionCalls: FunctionCall[] = []
  const updates: SpacesMock['updates'] = []
  const deletes: string[] = []
  const filters: SpacesMock['filters'] = []
  const affected = options.affected ?? [{ user_id: USER_A }]

  const selectChain = (payload: unknown) => {
    const chain = {
      eq: (column: string, value: unknown) => {
        filters.push({ column, value })
        return chain
      },
      in: () => chain,
      order: () => chain,
      then(onfulfilled?: (value: { data: unknown; error: null }) => unknown) {
        return Promise.resolve({ data: payload, error: null }).then(onfulfilled)
      },
    }
    return chain
  }

  const client = {
    rpcs,
    functionCalls,
    updates,
    deletes,
    filters,
    // listSpaces scopes itself to the caller's own membership row, so it needs a session.
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: USER_A } }, error: null }),
    },
    rpc: (name: string, args?: Record<string, unknown>) => {
      rpcs.push({ name, args })
      return Promise.resolve({ data: options.rpc?.[name] ?? null, error: null })
    },
    functions: {
      invoke: (name: string, init?: { body?: Record<string, unknown> }) => {
        functionCalls.push({ name, body: init?.body })
        return Promise.resolve(options.invokeResult ?? { data: { sent: true }, error: null })
      },
    },
    from(table: string) {
      return {
        select: () => selectChain(options.tables?.[table] ?? []),
        update: (row: Record<string, unknown>) => {
          updates.push({ table, row })
          return {
            eq: () => ({
              eq: () => ({ select: () => Promise.resolve({ data: affected, error: null }) }),
            }),
          }
        },
        delete: () => ({
          eq: (_column: string, value: string) => {
            deletes.push(value)
            return {
              eq: () => ({ select: () => Promise.resolve({ data: affected, error: null }) }),
              then(onfulfilled?: (value: { data: unknown; error: null }) => unknown) {
                return Promise.resolve({ data: affected, error: null }).then(onfulfilled)
              },
            }
          },
        }),
      }
    },
  }
  return client as unknown as SupabaseClient
}

function mockOf(client: SupabaseClient): SpacesMock {
  return client as unknown as SpacesMock
}

/**
 * A space's colour is stable, and chosen where one was chosen.
 *
 * Stability matters more than it sounds: the colour is how you recognise which workspace you are in,
 * so one that differed between devices — or shifted on reload — would be worse than none at all.
 */
function checkSpaceColor(): void {
  assert(spaceColorFor(SPACE_A, 'teal') === 'teal', 'a chosen colour is used')
  assert(
    spaceColorFor(SPACE_A, null) === spaceColorFor(SPACE_A, null),
    'a space with no colour still gets the same one every time',
  )
  assert(
    SPACE_COLORS.includes(spaceColorFor(SPACE_A, null)),
    'the derived colour is one the palette actually has',
  )
  // Colliding on one colour is fine for two given ids — the palette is only twelve wide. What would
  // defeat the point is every space landing on the same one, so this asks across a spread of ids.
  const spread = new Set(
    Array.from({ length: 24 }, (_, index) =>
      spaceColorFor(`${SPACE_B.slice(0, -2)}${index.toString(16).padStart(2, '0')}`, null),
    ),
  )
  assert(spread.size > 1, 'different spaces get different colours')

  // The identity works by repointing the tokens every accent in the app already reads, which is what
  // lets one style tint the header, the nav indicator, the buttons and the focus rings at once.
  const style = spaceAccentStyle(SPACE_A, 'rose') as Record<string, string>
  assert(style['--color-accent'] === 'var(--task-rose-solid)', 'the accent is repointed')
  assert(style['--color-accent-soft'] === 'var(--task-rose-card)', 'the soft accent is repointed')
  assert(style['--color-accent-ink'] === 'var(--task-rose-ink)', 'the accent ink is repointed')

  // And the surfaces, which is the half that actually answers "am I in a space" on a phone. The
  // accent alone shows on a handful of controls; --space-tint is what .space-theme mixes into the
  // grounds. Emitting the accents without it would leave the app looking almost personal.
  assert(style['--space-tint'] === 'var(--task-rose-solid)', 'the ground tint is set')
  assert(
    style['--space-tint'] === style['--color-accent'],
    'the tint and the accent are the same colour — two hues would read as two identities',
  )

  // Nothing is emitted that .space-theme cannot mix against: every value has to be a real colour at
  // the point color-mix() sees it, and a stray token name would silently drop the whole rule.
  for (const [name, value] of Object.entries(style)) {
    assert(
      value.startsWith('var(--task-'),
      `${name} resolves to a palette token, not a literal`,
    )
  }
}

/** What the UI believes about a role has to match what the database will actually allow. */
function checkRoles(): void {
  assert(SPACE_ROLES.length === 4, 'four roles')
  assert(!INVITABLE_ROLES.includes('owner'), 'an invitation can never hand out ownership')
  assert(INVITABLE_ROLES.length === 3, 'the other three can be invited')

  // Mirrors public.space_can_write.
  assert(roleCanWrite('owner'), 'an owner may write')
  assert(roleCanWrite('admin'), 'an admin may write')
  assert(roleCanWrite('editor'), 'an editor may write')
  assert(!roleCanWrite('viewer'), 'a viewer may not write')

  // Mirrors the space_members policies.
  assert(roleCanManageMembers('owner'), 'an owner manages members')
  assert(roleCanManageMembers('admin'), 'an admin manages members')
  assert(!roleCanManageMembers('editor'), 'an editor does not manage members')
  assert(!roleCanManageMembers('viewer'), 'a viewer does not manage members')

  for (const role of SPACE_ROLES) {
    assert(Boolean(ROLE_LABELS[role]), `${role} has a label`)
  }
}

/** The token has to survive the detour through signing up, which is the only reason it is stored. */
function checkPendingInvite(): void {
  if (typeof window === 'undefined') {
    return
  }
  clearPendingInvite()
  assert(readPendingInvite() === null, 'nothing stashed to begin with')
  stashPendingInvite('  abc123  ')
  assert(readPendingInvite() === 'abc123', 'a stashed token comes back trimmed')
  clearPendingInvite()
  assert(readPendingInvite() === null, 'a claimed token is cleared, so it is not retried forever')
}

/** '/spaces' is a list of workspaces, not a page of one. */
function checkSpacesNav(): void {
  assert(NAV_DESTINATIONS.spaces.path === '/spaces', 'the spaces tab points at /spaces')
  assert(navIdForPath('/spaces') === 'spaces', '/spaces is the spaces section')
  assert(navIdForPath('/tree') !== 'spaces', 'and nothing else is')

  /*
   * Spaces has a page but is not one of the ordered tabs.
   *
   * Both halves matter and they pull opposite ways. It must still resolve from its path, or its
   * sidebar row never lights up and its page slides in from an arbitrary side. And it must never
   * appear in the order, or the reorder list grows a sixth entry that moves nothing anyone can see —
   * the bar does not draw it and the sidebar pins its row regardless.
   */
  assert(
    !DEFAULT_NAV_ORDER.includes('spaces'),
    'the reorderable order holds only the five tabs that exist',
  )
  assert(DEFAULT_NAV_ORDER.length === 5, 'which is five of them')
  assert(
    !readNavOrder({ nav_order: 'tree,spaces,mynotes,important,tasks,profile' }).includes('spaces'),
    'an order stored by an older build is repaired rather than drawn',
  )
  assert(
    readNavOrder({ nav_order: 'tree,spaces,mynotes,important,tasks,profile' }).length === 5,
    'and repairing it leaves the bar with no hole in it',
  )
}

/**
 * Where you land is per workspace, and the two do not leak into each other.
 *
 * One value used to answer for the whole account: choosing to open a shared space on Tasks moved
 * your own notes there too, and the settings screen — the same component in both — showed the other
 * workspace's answer as though it were this one's.
 */
function checkDefaultPagePerWorkspace(): void {
  const metadata = {
    default_page: 'tasks',
    default_page_spaces: `${SPACE_A}:tree,${SPACE_B}:mynotes`,
  }

  assert(readDefaultPage(metadata) === 'tasks', 'the personal choice is the personal one')
  assert(readDefaultPage(metadata, SPACE_A) === 'tree', 'and each space has its own')
  assert(readDefaultPage(metadata, SPACE_B) === 'mynotes', 'independently of the others')

  // The important negative: a space nobody has set falls back to Starred, not to what you chose for
  // your own notes. Falling back to that is exactly the linkage being removed.
  assert(
    readDefaultPage(metadata, 'ffffffff-ffff-4fff-8fff-ffffffffffff') === 'important',
    'an unset space opens on Starred rather than inheriting the personal choice',
  )
  assert(readDefaultPage({}) === 'important', 'and an account that never chose opens there too')

  // Writing one space's choice must not lose the others, since they share a single stored string.
  const patch = defaultPageUpdate('tasks', SPACE_A, metadata)
  const rewritten = { default_page_spaces: patch.default_page_spaces }
  assert(readDefaultPage(rewritten, SPACE_A) === 'tasks', 'the change lands')
  assert(readDefaultPage(rewritten, SPACE_B) === 'mynotes', 'and the other space is untouched')
  assert(
    patch.default_page === undefined,
    'writing a space never writes the personal key — that is the leak, in the other direction',
  )

  // A hand-edited or truncated value cannot produce a page the app has no route for.
  assert(
    readDefaultPage({ default_page_spaces: `${SPACE_A}:nonsense` }, SPACE_A) === 'important',
    'an unknown page falls back rather than being trusted',
  )
  assert(
    readDefaultPage({ default_page_spaces: 'garbage' }, SPACE_A) === 'important',
    'and so does a value with no pair in it at all',
  )
}

/** What the repository sends, and what it makes of what comes back. */
async function checkRepository(): Promise<void> {
  // A membership row embeds its space; the head count is a second read of the same table.
  const listing = createSpacesMock({
    tables: {
      space_members: [
        {
          role: 'editor',
          spaces: {
            id: SPACE_A,
            name: 'Q3 Launch',
            color: 'teal',
            created_by: USER_A,
            created_at: '2026-08-28T00:00:00Z',
          },
        },
      ],
    },
  })
  const spaces = await new SupabaseSpacesDataRepository(listing).listSpaces()
  assert(spaces.length === 1, 'one space')
  assert(spaces[0]?.name === 'Q3 Launch', 'the name comes from the embedded space')
  assert(spaces[0]?.role === 'editor', 'the role comes from the membership')
  assert(spaces[0]?.color === 'teal', 'a palette colour is kept')

  /*
   * An unrecognised role reads as viewer.
   *
   * Least privilege on the way in: a row holding a value this build does not know about must not be
   * able to grant anything. The database is what enforces it either way — this only decides which
   * buttons get drawn — but drawing an editor's buttons for an unknown role is how a person comes to
   * believe they may do something they cannot.
   */
  const odd = createSpacesMock({
    tables: {
      space_members: [
        {
          role: 'superuser',
          spaces: {
            id: SPACE_A,
            name: 'Odd',
            color: 'not-a-colour',
            created_by: USER_A,
            created_at: '2026-08-28T00:00:00Z',
          },
        },
      ],
    },
  })
  const oddSpaces = await new SupabaseSpacesDataRepository(odd).listSpaces()
  assert(oddSpaces[0]?.role === 'viewer', 'an unknown role is read as the least-privileged one')
  assert(oddSpaces[0]?.color === null, 'an unknown colour falls back to the app accent')

  // Creating: the function writes the space and the owner row together, so the caller is its owner
  // and its only member without asking again.
  const creating = createSpacesMock({
    rpc: {
      create_space: {
        id: SPACE_B,
        name: 'New',
        color: null,
        created_by: USER_A,
        created_at: '2026-08-28T00:00:00Z',
      },
    },
  })
  const created = await new SupabaseSpacesDataRepository(creating).createSpace('New', null)
  assert(created.role === 'owner', 'whoever creates a space owns it')
  assert(created.memberCount === 1, 'and is the only one in it')
  assert(mockOf(creating).rpcs[0]?.name === 'create_space', 'creation goes through the function')

  // Responding: both routes into a space are offered, and whichever the caller used is passed on.
  const responding = createSpacesMock({ rpc: { respond_to_space_invite: SPACE_A } })
  const repository = new SupabaseSpacesDataRepository(responding)
  await repository.respondToInvite({ accept: true, inviteId: 'invite-1' })
  await repository.respondToInvite({ accept: false, token: 'tok' })
  const calls = mockOf(responding).rpcs
  assert(calls[0]?.args?.p_accept === true, 'accepting says so')
  assert(calls[0]?.args?.p_invite_id === 'invite-1', 'the in-app route passes the invitation')
  assert(calls[0]?.args?.p_token === null, 'and no token')
  assert(calls[1]?.args?.p_accept === false, 'declining says so')
  assert(calls[1]?.args?.p_token === 'tok', 'the link route passes the token')
  assert(calls[1]?.args?.p_invite_id === null, 'and no invitation id')

  /*
   * A space appears once, however many people are in it.
   *
   * space_members is readable for every member of a space you are in — deliberately, so the member
   * list can be shown — so an unfiltered read returns one row per *person*. A two-member space came
   * back twice, once carrying your role and once carrying theirs, which also put the same space under
   * both Mine and Joined at once because the split reads the role off the row. Asserted on the query,
   * because the scoping is not visible in the result.
   */
  const scoped = createSpacesMock({
    tables: {
      space_members: [
        {
          role: 'owner',
          spaces: {
            id: SPACE_A,
            name: 'Team',
            color: null,
            created_by: USER_A,
            created_at: '2026-08-28T00:00:00Z',
          },
        },
      ],
    },
  })
  const listed = await new SupabaseSpacesDataRepository(scoped).listSpaces()
  assert(listed.length === 1, 'one space, one entry')
  assert(
    mockOf(scoped).filters.some((filter) => filter.column === 'user_id' && filter.value === USER_A),
    "the read is scoped to the caller's own membership row",
  )

  // A role change is a plain update, because the policy already refuses the ones it should.
  const rerole = createSpacesMock({})
  await new SupabaseSpacesDataRepository(rerole).setMemberRole(SPACE_A, USER_A, 'admin' as SpaceRole)
  assert(mockOf(rerole).updates[0]?.table === 'space_members', 'a role change updates the membership')
  assert(mockOf(rerole).updates[0]?.row.role === 'admin', 'to the requested role')

  // Nothing changed means it was refused, and that has to surface rather than look like success.
  const refused = createSpacesMock({ affected: [] })
  let threw = false
  try {
    await new SupabaseSpacesDataRepository(refused).removeMember(SPACE_A, USER_A)
  } catch {
    threw = true
  }
  assert(threw, 'a removal that changed nothing is reported as a failure')

  // Transfer exists now even though nothing calls it yet: "exactly one owner" is only safe as an
  // invariant because there is a legitimate way to move it.
  const transfer = createSpacesMock({})
  await new SupabaseSpacesDataRepository(transfer).transferOwnership(SPACE_A, USER_A)
  assert(
    mockOf(transfer).rpcs[0]?.name === 'transfer_space_ownership',
    'ownership moves through the function, never a plain update',
  )
}

/**
 * The two display settings that belong to the space, and the one that does not.
 *
 * Read: an unset setting is null rather than the default, because "nobody has chosen" and "somebody
 * chose the default" have to fall back differently — the first defers to each member's own
 * preference, the second does not.
 *
 * Write: undefined leaves a setting alone, null clears it back to personal. Those cannot collapse
 * into one value, or "reset this" would be indistinguishable from "don't touch this".
 */
async function checkDisplaySettings(): Promise<void> {
  const withSettings = createSpacesMock({
    tables: {
      space_members: [
        {
          role: 'owner',
          spaces: {
            id: SPACE_A,
            name: 'Q3',
            color: 'teal',
            created_by: USER_A,
            created_at: '2026-08-28T00:00:00Z',
            nav_order: 'tasks,tree,important,mynotes,spaces,profile',
            view_style: 'clipboard',
          },
        },
      ],
    },
  })
  const [shared] = await new SupabaseSpacesDataRepository(withSettings).listSpaces()
  assert(shared?.navOrder?.[0] === 'tasks', "the space's own tab order is read")
  // The repository hands back what is stored, unrepaired — including a 'spaces' entry written by an
  // older build. Dropping it is readNavOrder's job, on the way to the bar (see useDisplaySettings),
  // so that a space's stored order is never silently rewritten by whoever happens to read it.
  assert(shared?.navOrder?.length === 6, 'every stored entry survives the round trip verbatim')
  assert(shared?.navOrder?.includes('spaces') === true, 'this one included, unrepaired')
  assert(
    !readNavOrder({ nav_order: shared!.navOrder!.join(',') }).includes('spaces'),
    'and it is the read on the way to the bar that drops it',
  )
  assert(shared?.viewStyle === 'clipboard', "and the space's note style")

  const unset = createSpacesMock({
    tables: {
      space_members: [
        {
          role: 'owner',
          spaces: {
            id: SPACE_A,
            name: 'Q3',
            color: null,
            created_by: USER_A,
            created_at: '2026-08-28T00:00:00Z',
            nav_order: '',
            view_style: null,
          },
        },
      ],
    },
  })
  const [bare] = await new SupabaseSpacesDataRepository(unset).listSpaces()
  assert(bare?.navOrder === null, 'an unset order is null, not the default')
  assert(bare?.viewStyle === null, 'and so is an unset note style')

  const rpcRow = {
    id: SPACE_A,
    name: 'Q3',
    color: null,
    created_by: USER_A,
    created_at: '2026-08-28T00:00:00Z',
    nav_order: 'tree,mynotes',
    view_style: 'professional',
  }

  const writing = createSpacesMock({ rpc: { set_space_display: rpcRow } })
  await new SupabaseSpacesDataRepository(writing).setDisplaySettings(SPACE_A, {
    navOrder: ['tree', 'mynotes'],
  })
  const call = mockOf(writing).rpcs[0]
  assert(call?.name === 'set_space_display', 'shared settings go through the function')
  assert(call?.args?.p_nav_order === 'tree,mynotes', 'the order is sent comma-joined')
  assert(
    call?.args?.p_view_style === null,
    'a setting not mentioned is sent as null, meaning leave it alone',
  )

  const clearing = createSpacesMock({ rpc: { set_space_display: rpcRow } })
  await new SupabaseSpacesDataRepository(clearing).setDisplaySettings(SPACE_A, { viewStyle: null })
  const clearCall = mockOf(clearing).rpcs[0]
  assert(
    clearCall?.args?.p_view_style === '',
    'clearing sends an empty string, which is not the same as leaving it alone',
  )
  assert(clearCall?.args?.p_nav_order === null, 'and the order is untouched')
}

/**
 * The space's own identity: its note and its picture, and who may change them.
 *
 * Split from the display settings on purpose, and checked separately for the same reason: how a space
 * *looks to work in* is open to any writing member, but what it *is* — name, note, face — is admin
 * only. The permission itself is enforced in SQL; what is checked here is that the two go through
 * different doors, so a later change to one cannot quietly widen the other.
 */
async function checkSpaceProfile(): Promise<void> {
  const row = {
    id: SPACE_A,
    name: 'Q3 Launch',
    color: 'teal',
    created_by: USER_A,
    created_at: '2026-08-28T00:00:00Z',
    description: '  Everything for the launch  ',
    image_url: 'https://example.test/pic.png?v=1',
  }

  const listing = createSpacesMock({
    tables: { space_members: [{ role: 'admin', spaces: row }] },
  })
  const [space] = await new SupabaseSpacesDataRepository(listing).listSpaces()
  assert(space?.description === '  Everything for the launch  ', 'the note comes through as stored')
  assert(space?.imageUrl === 'https://example.test/pic.png?v=1', 'and so does the picture')

  const blank = createSpacesMock({
    tables: {
      space_members: [{ role: 'admin', spaces: { ...row, description: '   ', image_url: '' } }],
    },
  })
  const [bare] = await new SupabaseSpacesDataRepository(blank).listSpaces()
  assert(bare?.description === null, 'a whitespace note is no note')
  assert(bare?.imageUrl === null, 'and an empty picture is no picture')

  const writing = createSpacesMock({ rpc: { set_space_profile: row } })
  const repository = new SupabaseSpacesDataRepository(writing)
  await repository.setProfile(SPACE_A, { description: 'New note' })
  const call = mockOf(writing).rpcs[0]
  assert(call?.name === 'set_space_profile', 'the identity goes through its own function')
  assert(call?.args?.p_description === 'New note', 'the note is sent')
  assert(call?.args?.p_name === null, 'a field not mentioned is null, meaning leave it alone')
  assert(call?.args?.p_image_url === null, 'including the picture')

  const clearing = createSpacesMock({ rpc: { set_space_profile: row } })
  await new SupabaseSpacesDataRepository(clearing).setProfile(SPACE_A, { imageUrl: null })
  const clearCall = mockOf(clearing).rpcs[0]
  assert(
    clearCall?.args?.p_image_url === '',
    'removing the picture sends an empty string, which is not the same as leaving it alone',
  )
  assert(clearCall?.args?.p_description === null, 'and the note is untouched')

  // The two doors are genuinely different, which is what keeps the permissions different.
  assert(
    mockOf(writing).rpcs.every((entry) => entry.name !== 'set_space_display'),
    'the identity never travels through the display-settings function',
  )
}

/**
 * The invitation mail: sent, and never able to take the invitation down with it.
 *
 * The mail is an Edge Function call after the row exists, which makes two failure modes possible
 * that the row-only version did not have. It could throw, and lose an invitation that was correctly
 * created — a link that works is still a way in, so that must never happen. And it could silently
 * not send while the screen said it had, which is worse than saying so: the admin would wait for an
 * acceptance that nobody was ever told to give.
 */
async function checkInviteMail(): Promise<void> {
  const inviting = createSpacesMock({
    rpc: {
      invite_to_space: {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        space_id: SPACE_A,
        email: 'Sam@Example.com',
        role: 'editor',
        token: 'tok',
        status: 'pending',
        created_at: '2026-08-28T00:00:00Z',
        expires_at: '2026-09-11T00:00:00Z',
      },
    },
  })
  const repository = new SupabaseSpacesDataRepository(inviting)
  const created = await repository.invite(SPACE_A, 'Sam@Example.com', 'editor')
  assert(mockOf(inviting).rpcs[0]?.name === 'invite_to_space', 'the row comes first')

  const mailed = await repository.notifyInvited(created.id)
  const call = mockOf(inviting).functionCalls[0]
  assert(call?.name === 'send-space-invite', 'the mail is an Edge Function, not a database write')
  assert(call?.body?.action === 'invited', 'and says which of the two messages it is')
  assert(call?.body?.inviteId === created.id, 'identified by the invitation, not by an address')
  assert(mailed, 'a successful send reports back as sent, so the dialog can say so')

  /*
   * A mailbox that is down, or a function not deployed yet. The invitation still stands, and the
   * screen falls back to "send them this link".
   *
   * The warning the repository logs is muted for the length of this one assertion. It is the correct
   * behaviour being exercised, and left on it prints a stack trace into every clean check run —
   * which is how a real warning stops being noticed.
   */
  const broken = createSpacesMock({
    invokeResult: { data: null, error: new Error('smtp is down') },
  })
  const warn = console.warn
  console.warn = () => undefined
  let failedSend: boolean
  try {
    failedSend = await new SupabaseSpacesDataRepository(broken).notifyInvited('any')
  } finally {
    console.warn = warn
  }
  assert(!failedSend, 'a failed send reports false rather than throwing')

  // Answering notifies by whichever handle the answer was given with — the in-app card has the id,
  // a link out of an inbox only ever has the token.
  const answered = createSpacesMock({})
  const answeredRepository = new SupabaseSpacesDataRepository(answered)
  await answeredRepository.notifyAnswered({ token: 'tok' })
  const answeredCall = mockOf(answered).functionCalls[0]
  assert(answeredCall?.body?.action === 'answered', 'the inviter is told separately')
  assert(answeredCall?.body?.token === 'tok', 'by token, for the link route')

  // Nothing to identify means nothing to send, and no call at all — an Edge Function invocation
  // that could only ever 400 is a round trip bought for nothing.
  const nothing = createSpacesMock({})
  const noHandle = await new SupabaseSpacesDataRepository(nothing).notifyAnswered({})
  assert(!noHandle, 'no invitation named means nothing sent')
  assert(mockOf(nothing).functionCalls.length === 0, 'and no call made')
}

export async function runSpacesChecks(): Promise<void> {
  checkSpaceColor()
  checkRoles()
  checkPendingInvite()
  checkSpacesNav()
  checkDefaultPagePerWorkspace()
  await checkRepository()
  await checkDisplaySettings()
  await checkSpaceProfile()
  await checkInviteMail()
}
