import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'

const BUCKET = 'media'

// Uploads a gallery-picked image/video (base64) to the public `media` bucket
// and returns its public URL, or null on failure. Files are namespaced under
// the user's id so the storage RLS policy can scope writes per user.
export async function uploadMedia(
  base64: string,
  ext: string,
  contentType: string
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const path = `${user.id}/${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), { contentType, upsert: false })
  if (error) {
    console.error('uploadMedia:', error.message)
    return null
  }

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
