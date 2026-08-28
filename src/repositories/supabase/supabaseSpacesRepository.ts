import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../../lib/supabase'
import { isSpacePaletteColor } from '../../lib/spaceColor'
import type {
  IncomingSpaceInvite,
  SpaceActivityAction,
  SpaceActivityEntity,
  SpaceActivityEntry,
  SpaceInvite,
  SpaceMember,
  SpaceRole,
  SpaceSummary,
} from '../../types'
import { RepositoryError, toRepositoryError } from '../errors'
import type { SpacesDataRepository } from '../types'

/** The columns a space row is read with. Kept beside the mapper so the two can't drift. */
const SPACE_COLUMNS =
  'id,name,color,created_by,created_at,nav_order,view_style,description,image_url'

interface SpaceRow {
  id: string
  name: string
  color: string | null
  created_by: string
  created_at: string
  /** Comma-joined, the same shape user_metadata stores it in — see navOrderUpdate. */
  nav_order?: string | null
  view_style?: string | null
  description?: string | null
  image_url?: string | null
}

interface MembershipRow {
  role: string
  spaces: SpaceRow | null
}

interface InviteRow {
  id: string
  space_id: string
  email: string
  role: string
  token: string
  status: string
  created_at: string
  expires_at: string
}

interface IncomingInviteRow {
  id: string
  space_id: string
  space_name: string
  space_color: string | null
  role: string
  token: string
  created_at: string
  expires_at: string
  invited_by_name: string | null
  invited_by_email: string
}

interface ActivityRow {
  id: number
  occurred_at: string
  action: string
  entity_type: string
  entity_id: string
  entity_title: string | null
  path_label: string | null
  intent: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  actor_id: string | null
  actor_name: string | null
  actor_email: string | null
  actor_avatar_url: string | null
}

/** Anything this build doesn't recognise reads as the catch-all rather than being dropped. A feed
 *  that silently omits entries it cannot label is worse than one that says "changed". */
const KNOWN_ACTIONS: SpaceActivityAction[] = [
  'created',
  'deleted',
  'renamed',
  'moved',
  'completed',
  'reopened',
  'due_changed',
  'content_edited',
  'starred',
  'unstarred',
  'attachment_added',
  'attachment_removed',
  'updated',
]

function toAction(value: string): SpaceActivityAction {
  return (KNOWN_ACTIONS as string[]).includes(value)
    ? (value as SpaceActivityAction)
    : 'updated'
}

function toEntity(value: string): SpaceActivityEntity {
  return value === 'folder' || value === 'subtask' || value === 'attachment' ? value : 'task'
}

function activityFromRow(row: ActivityRow): SpaceActivityEntry {
  return {
    id: Number(row.id),
    occurredAt: row.occurred_at,
    action: toAction(row.action),
    entityType: toEntity(row.entity_type),
    entityId: row.entity_id,
    entityTitle: row.entity_title,
    pathLabel: row.path_label,
    intent: row.intent,
    before: row.before,
    after: row.after,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    actorAvatarUrl: row.actor_avatar_url,
  }
}

interface DirectoryRow {
  user_id: string
  role: string
  joined_at: string
  email: string
  full_name: string | null
  avatar_url: string | null
}

/** Anything the database doesn't recognise is read as the least-privileged role rather than
 *  guessed upward. A row that somehow held a bad value should not be able to grant anything. */
function toRole(value: string): SpaceRole {
  return value === 'owner' || value === 'admin' || value === 'editor' ? value : 'viewer'
}

function toStatus(value: string): SpaceInvite['status'] {
  return value === 'accepted' || value === 'declined' || value === 'revoked' ? value : 'pending'
}

function spaceFromRow(row: SpaceRow, role: string, memberCount: number): SpaceSummary {
  const navOrder = (row.nav_order ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return {
    id: row.id,
    name: row.name,
    color: isSpacePaletteColor(row.color) ? row.color : null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    description: row.description?.trim() ? row.description : null,
    imageUrl: row.image_url?.trim() ? row.image_url : null,
    role: toRole(role),
    memberCount,
    // Empty means nobody has set one, which is different from an order that happens to be the
    // default — the first falls back to each member's own preference, the second does not.
    navOrder: navOrder.length > 0 ? navOrder : null,
    viewStyle:
      row.view_style === 'clipboard' || row.view_style === 'professional' ? row.view_style : null,
  }
}

function inviteFromRow(row: InviteRow): SpaceInvite {
  return {
    id: row.id,
    spaceId: row.space_id,
    email: row.email,
    role: toRole(row.role),
    token: row.token,
    status: toStatus(row.status),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

/**
 * Spaces, membership and invitations.
 *
 * Reads are ordinary selects wherever row level security can express them, which is nearly
 * everywhere: the phase 1 policies already say a member may see their spaces and who else is in
 * them. Writes that change membership are functions instead, because each one must happen completely
 * or not at all — a space without its owner row is invisible to the person who made it, and an
 * accepted invitation without a membership is a dead end.
 */
export class SupabaseSpacesDataRepository implements SpacesDataRepository {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient | null = getSupabaseClient()) {
    if (!client) {
      throw new RepositoryError('Supabase is not configured.')
    }
    this.client = client
  }

  /**
   * Every space this account is in, with its role and how many people are in it.
   *
   * Two selects rather than a function: the membership rows carry the role and embed the space, and
   * the head count is a second read of the same table the policy already opens. Both are things RLS
   * can answer, so neither needs elevating.
   */
  async listSpaces(): Promise<SpaceSummary[]> {
    try {
      /*
       * Scoped to my own membership rows, which the policy does not do for me.
       *
       * space_members is readable for every member of a space I am in — deliberately, so the member
       * list can be shown. That means an unfiltered read of it returns one row per *person*, so a
       * two-member space came back twice: once carrying my role and once carrying theirs. Which also
       * put the same space under both Mine and Joined at the same time, because the split reads the
       * role off the row.
       */
      const userId = await this.requireUserId()
      const { data, error } = await this.client
        .from('space_members')
        .select(`role,spaces!inner(${SPACE_COLUMNS})`)
        .eq('user_id', userId)
        .order('joined_at', { ascending: true })
      if (error) {
        throw toRepositoryError(error, 'Could not load your shared spaces.')
      }

      const rows = (data ?? []) as unknown as MembershipRow[]
      const spaceIds = rows.map((row) => row.spaces?.id).filter((id): id is string => Boolean(id))
      const counts = await this.memberCounts(spaceIds)

      return rows
        .filter((row): row is MembershipRow & { spaces: SpaceRow } => row.spaces !== null)
        .map((row) => spaceFromRow(row.spaces, row.role, counts.get(row.spaces.id) ?? 1))
    } catch (error) {
      throw toRepositoryError(error, 'Could not load your shared spaces.')
    }
  }

  private async requireUserId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser()
    if (error || !data.user) {
      throw new RepositoryError('You need to be signed in.')
    }
    return data.user.id
  }

  /** Head counts for the spaces the caller is in. Absent counts fall back to 1 rather than 0: the
   *  caller is demonstrably in the space, so zero is the one answer that cannot be right. */
  private async memberCounts(spaceIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    if (spaceIds.length === 0) {
      return counts
    }
    const { data, error } = await this.client
      .from('space_members')
      .select('space_id')
      .in('space_id', spaceIds)
    if (error) {
      return counts
    }
    for (const row of (data ?? []) as Array<{ space_id: string }>) {
      counts.set(row.space_id, (counts.get(row.space_id) ?? 0) + 1)
    }
    return counts
  }

  /**
   * Invitations addressed to this account, with the name of the space each is for.
   *
   * The one read that has to be a function. An invitee is not yet a member, and the policy on
   * public.spaces requires membership — so the invitation row is readable but the space's name,
   * which is the only part worth showing, is not.
   */
  async listIncomingInvites(): Promise<IncomingSpaceInvite[]> {
    try {
      const { data, error } = await this.client.rpc('my_space_invites')
      if (error) {
        throw toRepositoryError(error, 'Could not load your invitations.')
      }
      return ((data ?? []) as IncomingInviteRow[]).map((row) => ({
        id: row.id,
        spaceId: row.space_id,
        spaceName: row.space_name,
        spaceColor: isSpacePaletteColor(row.space_color) ? row.space_color : null,
        role: toRole(row.role),
        token: row.token,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        invitedByName: row.invited_by_name,
        invitedByEmail: row.invited_by_email,
      }))
    } catch (error) {
      throw toRepositoryError(error, 'Could not load your invitations.')
    }
  }

  /** Invitations still outstanding for one space, for whoever is managing it. */
  async listPendingInvites(spaceId: string): Promise<SpaceInvite[]> {
    try {
      const { data, error } = await this.client
        .from('space_invites')
        .select('id,space_id,email,role,token,status,created_at,expires_at')
        .eq('space_id', spaceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (error) {
        throw toRepositoryError(error, 'Could not load the invitations for this space.')
      }
      return ((data ?? []) as InviteRow[]).map(inviteFromRow)
    } catch (error) {
      throw toRepositoryError(error, 'Could not load the invitations for this space.')
    }
  }

  /** Who is in a space, with the names and avatars the member list shows. auth.users is not
   *  readable by the client, so this is the one place that boundary is crossed. */
  async listMembers(spaceId: string): Promise<SpaceMember[]> {
    try {
      const { data, error } = await this.client.rpc('space_member_directory', {
        p_space_id: spaceId,
      })
      if (error) {
        throw toRepositoryError(error, 'Could not load the people in this space.')
      }
      return ((data ?? []) as DirectoryRow[]).map((row) => ({
        userId: row.user_id,
        role: toRole(row.role),
        joinedAt: row.joined_at,
        email: row.email,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
      }))
    } catch (error) {
      throw toRepositoryError(error, 'Could not load the people in this space.')
    }
  }

  async createSpace(name: string, color: string | null): Promise<SpaceSummary> {
    try {
      const { data, error } = await this.client.rpc('create_space', {
        p_name: name,
        p_color: color,
      })
      if (error) {
        throw toRepositoryError(error, 'Could not create the space.')
      }
      const row = (Array.isArray(data) ? data[0] : data) as SpaceRow | null
      if (!row) {
        throw new RepositoryError('Could not create the space.')
      }
      // The creator is its owner and its only member — the function wrote both in one transaction.
      return spaceFromRow(row, 'owner', 1)
    } catch (error) {
      throw toRepositoryError(error, 'Could not create the space.')
    }
  }

  async invite(spaceId: string, email: string, role: SpaceRole): Promise<SpaceInvite> {
    try {
      const { data, error } = await this.client.rpc('invite_to_space', {
        p_space_id: spaceId,
        p_email: email,
        p_role: role,
      })
      if (error) {
        throw toRepositoryError(error, 'Could not send the invitation.')
      }
      const row = (Array.isArray(data) ? data[0] : data) as InviteRow | null
      if (!row) {
        throw new RepositoryError('Could not send the invitation.')
      }
      return inviteFromRow(row)
    } catch (error) {
      throw toRepositoryError(error, 'Could not send the invitation.')
    }
  }

  /*
   * ---------------------------------------------------------------- the mail
   *
   * An Edge Function rather than anything in the database, for two reasons that both come down to
   * where the knowledge lives. It has to read auth.users — to tell an address that has an account
   * from one that does not, which decides whether the message says "sign in" or "sign up" — and
   * PostgREST does not expose that table to any client. And it holds the mailbox credentials, which
   * have no business being reachable from a browser.
   *
   * Neither of these throws. An invitation that was created correctly is a real invitation whether
   * or not the mail left the building, and the link still works; turning a mailbox outage into a
   * failed invite would lose the row that matters. They answer whether the message went, and the
   * screens say so.
   */
  private async sendInviteMail(body: Record<string, unknown>): Promise<boolean> {
    try {
      const { data, error } = await this.client.functions.invoke('send-space-invite', { body })
      if (error) {
        console.warn('invitation mail was not sent', error)
        return false
      }
      return (data as { sent?: boolean } | null)?.sent === true
    } catch (caught) {
      // A function that is not deployed yet, or no network. The invitation stands either way.
      console.warn('invitation mail was not sent', caught)
      return false
    }
  }

  async notifyInvited(inviteId: string): Promise<boolean> {
    return this.sendInviteMail({ action: 'invited', inviteId })
  }

  async notifyAnswered(args: { inviteId?: string; token?: string }): Promise<boolean> {
    if (!args.inviteId && !args.token) {
      return false
    }
    return this.sendInviteMail({
      action: 'answered',
      inviteId: args.inviteId,
      token: args.token,
    })
  }

  /**
   * Accept or decline, identified either by the invitation or by the token from a link.
   *
   * Both routes exist because there are two journeys into a space. Someone already using the app
   * taps a card and is matched on their email. Someone arriving from their inbox may have signed up
   * with a different address than the one invited, so for them the token is the credential.
   */
  async respondToInvite(args: {
    accept: boolean
    inviteId?: string
    token?: string
  }): Promise<string> {
    const failure = args.accept
      ? 'Could not accept the invitation.'
      : 'Could not decline the invitation.'
    try {
      const { data, error } = await this.client.rpc('respond_to_space_invite', {
        p_accept: args.accept,
        p_invite_id: args.inviteId ?? null,
        p_token: args.token ?? null,
      })
      if (error) {
        throw toRepositoryError(error, failure)
      }
      const spaceId = (Array.isArray(data) ? data[0] : data) as string | null
      if (!spaceId) {
        throw new RepositoryError(failure)
      }
      return spaceId
    } catch (error) {
      throw toRepositoryError(error, failure)
    }
  }

  /** A plain update: the phase 1 policy already says an admin may change a role, and refuses to
   *  touch the owner's — which is why transferring ownership is a function and this is not. */
  async setMemberRole(spaceId: string, userId: string, role: SpaceRole): Promise<void> {
    try {
      const { data, error } = await this.client
        .from('space_members')
        .update({ role })
        .eq('space_id', spaceId)
        .eq('user_id', userId)
        .select('user_id')
      if (error) {
        throw toRepositoryError(error, 'Could not change that role.')
      }
      if (!data || data.length === 0) {
        throw new RepositoryError('Could not change that role.')
      }
    } catch (error) {
      throw toRepositoryError(error, 'Could not change that role.')
    }
  }

  /** Removing someone else, or leaving yourself — the same delete, and the policy tells them
   *  apart. The owner's row is refused either way. */
  async removeMember(spaceId: string, userId: string): Promise<void> {
    try {
      const { data, error } = await this.client
        .from('space_members')
        .delete()
        .eq('space_id', spaceId)
        .eq('user_id', userId)
        .select('user_id')
      if (error) {
        throw toRepositoryError(error, 'Could not remove that person.')
      }
      if (!data || data.length === 0) {
        throw new RepositoryError(
          'Could not remove that person. A space owner has to hand the space over first.',
        )
      }
    } catch (error) {
      throw toRepositoryError(error, 'Could not remove that person.')
    }
  }

  async revokeInvite(inviteId: string): Promise<void> {
    try {
      const { error } = await this.client.from('space_invites').delete().eq('id', inviteId)
      if (error) {
        throw toRepositoryError(error, 'Could not withdraw the invitation.')
      }
    } catch (error) {
      throw toRepositoryError(error, 'Could not withdraw the invitation.')
    }
  }

  /**
   * What has happened here, newest first.
   *
   * A function rather than a plain select on space_activity — which members *can* read — because the
   * feed shows who did something, and auth.users is not reachable from the client. The same narrow
   * boundary crossing as the member directory.
   */
  async listActivity(
    spaceId: string,
    options?: {
      beforeId?: number
      limit?: number
      actorIds?: string[]
      actions?: SpaceActivityAction[]
    },
  ): Promise<SpaceActivityEntry[]> {
    try {
      const { data, error } = await this.client.rpc('space_activity_feed', {
        p_space_id: spaceId,
        p_before_id: options?.beforeId ?? null,
        p_limit: options?.limit ?? 50,
        // Null rather than an empty array for "no filter": the function treats both as unfiltered,
        // but null is the one that reads as absent in a log of the request.
        p_actor_ids: options?.actorIds?.length ? options.actorIds : null,
        p_actions: options?.actions?.length ? options.actions : null,
      })
      if (error) {
        throw toRepositoryError(error, 'Could not load what has happened here.')
      }
      return ((data ?? []) as ActivityRow[]).map(activityFromRow)
    } catch (error) {
      throw toRepositoryError(error, 'Could not load what has happened here.')
    }
  }

  async listEntityHistory(
    entityType: SpaceActivityEntity,
    entityId: string,
  ): Promise<SpaceActivityEntry[]> {
    try {
      const { data, error } = await this.client.rpc('space_entity_history', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_limit: 50,
      })
      if (error) {
        throw toRepositoryError(error, 'Could not load the history for this item.')
      }
      return ((data ?? []) as ActivityRow[]).map(activityFromRow)
    } catch (error) {
      throw toRepositoryError(error, 'Could not load the history for this item.')
    }
  }

  /**
   * The display settings that belong to the space.
   *
   * Through a function because the UPDATE policy on spaces is admin-only — renaming or deleting a
   * space is not an editor's business — while these two are open to anyone who can write. An empty
   * string clears one back to each member's own preference; leaving it out changes nothing.
   */
  async setDisplaySettings(
    spaceId: string,
    settings: { navOrder?: string[] | null; viewStyle?: string | null },
  ): Promise<SpaceSummary> {
    try {
      const { data, error } = await this.client.rpc('set_space_display', {
        p_space_id: spaceId,
        p_nav_order:
          settings.navOrder === undefined
            ? null
            : settings.navOrder === null
              ? ''
              : settings.navOrder.join(','),
        p_view_style:
          settings.viewStyle === undefined ? null : (settings.viewStyle ?? ''),
      })
      if (error) {
        throw toRepositoryError(error, 'Could not save that for this space.')
      }
      const updated = (Array.isArray(data) ? data[0] : data) as SpaceRow | null
      if (!updated) {
        throw new RepositoryError('Could not save that for this space.')
      }
      // The role and head count are not the function's to report; the caller already knows them.
      return spaceFromRow(updated, 'editor', 1)
    } catch (error) {
      throw toRepositoryError(error, 'Could not save that for this space.')
    }
  }

  /**
   * The space's own identity: name, note, colour, picture.
   *
   * Separate from setDisplaySettings, and admin-only where that one is open to any writing member.
   * How a space *looks to work in* is everyone's; what it *is* should not change under the people
   * using it because an editor was tidying up.
   */
  async setProfile(
    spaceId: string,
    profile: {
      name?: string
      description?: string | null
      color?: string | null
      imageUrl?: string | null
    },
  ): Promise<SpaceSummary> {
    const asParam = (value: string | null | undefined): string | null =>
      value === undefined ? null : (value ?? '')
    try {
      const { data, error } = await this.client.rpc('set_space_profile', {
        p_space_id: spaceId,
        p_name: profile.name ?? null,
        p_description: asParam(profile.description),
        p_color: asParam(profile.color),
        p_image_url: asParam(profile.imageUrl),
      })
      if (error) {
        throw toRepositoryError(error, 'Could not save this space.')
      }
      const updated = (Array.isArray(data) ? data[0] : data) as SpaceRow | null
      if (!updated) {
        throw new RepositoryError('Could not save this space.')
      }
      // Role and head count are not this function's to report; the caller already knows both.
      return spaceFromRow(updated, 'owner', 1)
    } catch (error) {
      throw toRepositoryError(error, 'Could not save this space.')
    }
  }

  /**
   * Hand the space to someone else.
   *
   * Not exposed in the UI yet — the admin screens are a later phase. It exists now because "exactly
   * one owner" is only a safe invariant if there is a legitimate way to move it, and the database
   * refuses every other route.
   */
  async transferOwnership(spaceId: string, toUserId: string): Promise<void> {
    try {
      const { error } = await this.client.rpc('transfer_space_ownership', {
        p_space_id: spaceId,
        p_to_user: toUserId,
      })
      if (error) {
        throw toRepositoryError(error, 'Could not transfer the space.')
      }
    } catch (error) {
      throw toRepositoryError(error, 'Could not transfer the space.')
    }
  }
}
