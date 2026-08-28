import { getSupabaseClient } from '../../lib/supabase'
import { assertAllowedAvatarFile, AVATAR_BUCKET } from './avatarUpload'

/**
 * A space's picture, in the same bucket as everyone's avatar.
 *
 * The same kind of thing at the same size with the same rules, so a second public image bucket would
 * be two sets of policies to keep in step for no gain. The path is what separates them:
 * `space/<space id>/…` against a user's `<user id>/…`, and a uuid can never equal the literal
 * "space", so the two namespaces cannot collide. The storage policy keys on exactly that — whoever
 * may manage the space may change its face.
 */
export async function uploadSpaceImage(spaceId: string, file: File): Promise<string> {
  assertAllowedAvatarFile(file)
  const client = getSupabaseClient()
  if (!client) {
    throw new Error('Supabase is not configured.')
  }
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `space/${spaceId}/image.${extension}`
  const { error } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) {
    throw new Error('Could not upload the picture.')
  }
  const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  // Cache-busted, because the path is fixed per space and overwritten in place — without this the
  // old picture stays on screen until the browser decides otherwise.
  return `${data.publicUrl}?v=${Date.now()}`
}
