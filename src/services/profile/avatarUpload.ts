import { getSupabaseClient } from '../../lib/supabase'

export const AVATAR_BUCKET = 'avatars'
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function assertAllowedAvatarFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Choose a JPEG, PNG, WEBP, or GIF image.')
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Choose an image under 5 MB.')
  }
}

/** Uploads to a fixed per-user path (overwriting any previous photo) and returns a cache-busted public URL. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  assertAllowedAvatarFile(file)
  const client = getSupabaseClient()
  if (!client) {
    throw new Error('Supabase is not configured.')
  }
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/avatar.${extension}`
  const { error: uploadError } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) {
    throw new Error('Could not upload the photo.')
  }
  const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
