import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseSpacesDataRepository } from '../../repositories/supabase/supabaseSpacesRepository'
import { summariseIntents, WRITE_INTENT } from '../../lib/writeIntent'
import {
  ACTION_ICONS,
  ACTION_LABELS,
  ACTIVITY_ACTIONS,
  actorLabel,
  describeAction,
} from '../../lib/spaceActivity'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

const SPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

interface ActivityMock {
  rpcs: Array<{ name: string; args: Record<string, unknown> }>
}

function createActivityMock(rows: unknown): SupabaseClient {
  const rpcs: ActivityMock['rpcs'] = []
  const client = {
    rpcs,
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args })
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return client as unknown as SupabaseClient
}

function mockOf(client: SupabaseClient): ActivityMock {
  return client as unknown as ActivityMock
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    occurred_at: '2026-08-28T10:00:00Z',
    action: 'moved',
    entity_type: 'task',
    entity_id: TASK,
    entity_title: 'Invoices',
    path_label: 'Q3 Launch / Finance',
    intent: WRITE_INTENT.taskMoved,
    before: { folder_id: 'old' },
    after: { folder_id: 'new' },
    actor_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    actor_name: 'Yash',
    actor_email: 'yash@example.test',
    actor_avatar_url: null,
    ...overrides,
  }
}

/**
 * A flush's worth of actions becomes one sentence.
 *
 * The intent describes the batch, because that is the unit the write path sends and the unit the
 * triggers see. Repeats collapse — forty keystrokes are one edit — but two genuinely different
 * actions are both named rather than one being picked and the other implied away.
 */
function checkIntentSummary(): void {
  assert(summariseIntents([]) === undefined, 'nothing to say means no intent at all')
  assert(summariseIntents(['   ']) === undefined, 'whitespace is not an intent')
  assert(
    summariseIntents([WRITE_INTENT.taskEdited]) === 'Edited a note',
    'one action is said plainly',
  )
  assert(
    summariseIntents([WRITE_INTENT.taskEdited, WRITE_INTENT.taskEdited]) === 'Edited a note',
    'the same action twice is still one edit',
  )
  assert(
    summariseIntents([WRITE_INTENT.taskRenamed, WRITE_INTENT.taskCompleted]) ===
      'Renamed a note; Marked a note done',
    'two different actions are both named, in the order they happened',
  )
  // Every label is distinct, or the feed would describe two different things identically.
  const labels = Object.values(WRITE_INTENT)
  assert(new Set(labels).size === labels.length, 'no two intents read the same')
}

/** What the repository makes of a feed row, and what it sends to get one. */
async function checkActivityReads(): Promise<void> {
  const feed = createActivityMock([row()])
  const entries = await new SupabaseSpacesDataRepository(feed).listActivity(SPACE, {
    beforeId: 99,
    limit: 25,
  })

  const call = mockOf(feed).rpcs[0]
  assert(call?.name === 'space_activity_feed', 'the feed comes from the function, not the table')
  assert(call?.args.p_space_id === SPACE, 'for the space asked about')
  assert(call?.args.p_before_id === 99, 'paged by cursor, not offset')
  assert(call?.args.p_limit === 25, 'with the page size asked for')
  /*
   * Unfiltered reads send null, not an empty array.
   *
   * The function treats both as "no filter", so this is not a correctness fix — but a request that
   * carries `[]` reads as a deliberately empty selection, and the next person to change either side
   * has to work out which one it means. Null is the one that says nothing was asked for.
   */
  assert(call?.args.p_actor_ids === null, 'nobody in particular means null')
  assert(call?.args.p_actions === null, 'and no kind in particular means null')

  // And a filtered read sends exactly what was picked, because the server is what applies it: the
  // feed is paged and kept for a year, so a filter applied to the page on screen would search only
  // what had already been scrolled past.
  const filtered = createActivityMock([row()])
  await new SupabaseSpacesDataRepository(filtered).listActivity(SPACE, {
    actorIds: ['u1', 'u2'],
    actions: ['deleted'],
  })
  const filteredCall = mockOf(filtered).rpcs[0]
  assert(
    JSON.stringify(filteredCall?.args.p_actor_ids) === '["u1","u2"]',
    'both people are sent, not just the first',
  )
  assert(
    JSON.stringify(filteredCall?.args.p_actions) === '["deleted"]',
    'and the kinds asked for',
  )

  const entry = entries[0]
  assert(entry?.id === 7, 'the id survives, because it is also the cursor')
  assert(entry?.action === 'moved', 'the action is the one the database derived')
  assert(entry?.entityType === 'task', 'the entity type is mapped')
  assert(entry?.entityTitle === 'Invoices', 'the stored title comes through')
  assert(entry?.pathLabel === 'Q3 Launch / Finance', 'and where it was at the time')
  assert(entry?.actorName === 'Yash', 'and who did it')
  assert(entry?.intent === WRITE_INTENT.taskMoved, 'and the sentence the write path declared')
  // Read through, not cast through: `entry?.before as X` then a property access throws a TypeError
  // when there is no entry, which reports a missing row as a crash rather than a failed assertion.
  assert(entry?.before?.folder_id === 'old', 'the real before state is kept')
  assert(
    entry?.after?.folder_id === 'new',
    'and the real after state — which is what makes a misleading intent harmless',
  )

  /*
   * An entry this build has no name for still appears.
   *
   * A later phase will add actions this one has never heard of — locked, restored — and an older
   * client reading a newer log must not quietly drop those lines. Dropping them is the one failure
   * mode a log cannot have: the gap looks exactly like nothing having happened.
   */
  const future = createActivityMock([row({ action: 'teleported', entity_type: 'wormhole' })])
  const [odd] = await new SupabaseSpacesDataRepository(future).listActivity(SPACE)
  assert(odd?.action === 'updated', 'an unknown action falls back to the catch-all')
  assert(odd?.entityType === 'task', 'and an unknown entity type still renders')

  // A record with no intent is complete — it just has no sentence. This is what a write that
  // bypassed space_apply looks like from here.
  const bare = createActivityMock([row({ intent: null, actor_name: null })])
  const [plain] = await new SupabaseSpacesDataRepository(bare).listActivity(SPACE)
  assert(plain?.intent === null, 'an entry without an intent is still an entry')
  assert(plain?.actorEmail === 'yash@example.test', 'and still names who did it')

  // Per-item history asks the narrower function, keyed by the thing rather than the space.
  const history = createActivityMock([row()])
  await new SupabaseSpacesDataRepository(history).listEntityHistory('task', TASK)
  const historyCall = mockOf(history).rpcs[0]
  assert(historyCall?.name === 'space_entity_history', 'one item asks the entity function')
  assert(historyCall?.args.p_entity_type === 'task', 'naming the entity type')
  assert(historyCall?.args.p_entity_id === TASK, 'and the entity')
}

/**
 * Every action the feed can carry is something the UI can name, filter by and draw.
 *
 * Three separate tables key off SpaceActivityAction — the filter's order, its labels and its icons —
 * and a later phase adds actions (locked, restored). TypeScript catches a missing key in the two
 * Records, but not a missing entry in ACTIVITY_ACTIONS: a new action would then be shown in the feed
 * and be impossible to filter for, which is the silent half of the failure.
 */
function checkActionCoverage(): void {
  const labelled = Object.keys(ACTION_LABELS)
  assert(
    ACTIVITY_ACTIONS.length === labelled.length,
    'the filter offers every action that has a label',
  )
  assert(
    new Set(ACTIVITY_ACTIONS).size === ACTIVITY_ACTIONS.length,
    'and offers none of them twice',
  )
  for (const action of ACTIVITY_ACTIONS) {
    assert(Boolean(ACTION_LABELS[action]), `${action} has a name a person can read`)
    assert(Boolean(ACTION_ICONS[action]), `${action} has a glyph`)
  }
  // Distinct labels, or two filter rows would read identically and pick different things.
  const names = ACTIVITY_ACTIONS.map((action) => ACTION_LABELS[action])
  assert(new Set(names).size === names.length, 'no two kinds of change read the same')
}

/** The two pills, which is what a row is now made of rather than one sentence. */
function checkRowPills(): void {
  const entry = { ...row(), action: 'deleted', entity_type: 'task' }
  const deleted = {
    action: 'deleted' as const,
    entityType: 'task' as const,
    actorName: null,
    actorEmail: null,
  }
  assert(
    describeAction({ ...entry, ...deleted } as never) === 'deleted a note',
    'the action pill says what happened to what, and never who',
  )
  assert(
    !describeAction({ ...entry, ...deleted } as never).includes('Yash'),
    'the actor is the other pill — putting the name in both would say it twice',
  )
  assert(
    actorLabel({ actorName: '  Yash  ', actorEmail: 'y@example.com' } as never) === 'Yash',
    'a name is trimmed and preferred',
  )
  assert(
    actorLabel({ actorName: '   ', actorEmail: 'y@example.com' } as never) === 'y@example.com',
    'a blank name falls through to the address',
  )
  assert(
    actorLabel({ actorName: null, actorEmail: null } as never) === 'Someone',
    'and a deleted account still reads as a sentence',
  )
}

export async function runActivityChecks(): Promise<void> {
  checkIntentSummary()
  checkActionCoverage()
  checkRowPills()
  await checkActivityReads()
}
