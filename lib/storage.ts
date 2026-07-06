import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'
import { updateProfile } from './cloudDb'

const BUCKET = 'media'
const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2 MB cap on avatar uploads
const LOCAL_MEDIA_DIR = `${FileSystem.documentDirectory}media/`

// Persists a gallery-picked image/video to on-device storage for signed-out
// (local-only) use, returning a file:// URI to store as the save's image_url.
async function saveMediaLocally(base64: string, ext: string): Promise<string | null> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(LOCAL_MEDIA_DIR)
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(LOCAL_MEDIA_DIR, { intermediates: true })
    }
    const path = `${LOCAL_MEDIA_DIR}${Date.now()}.${ext}`
    await FileSystem.writeAsStringAsync(path, base64, { encoding: 'base64' })
    return path
  } catch (e) {
    console.error('saveMediaLocally:', e)
    return null
  }
}

// Signed in: uploads a gallery-picked image/video (base64) to the public
// `media` bucket, namespaced under the user's id so the storage RLS policy
// can scope writes per user. Signed out: saves it on-device instead, so
// image/video saves work fully offline without an account.
export async function uploadMedia(
  base64: string,
  ext: string,
  contentType: string
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return saveMediaLocally(base64, ext)

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

export class AvatarTooLargeError extends Error {
  constructor() {
    super('That image is over 2 MB. Please pick a smaller one.')
    this.name = 'AvatarTooLargeError'
  }
}

// Lets the user pick a square photo, uploads it under their own id in the media
// bucket, and stores the public URL on their profile. Returns the new avatar
// URL, or null if the user cancelled the picker.
export async function pickAndUploadAvatar(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new Error('Photo access is needed to change your avatar.')

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
  })
  if (result.canceled) return null

  const asset = result.assets[0]
  if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) throw new AvatarTooLargeError()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to upload an avatar.')

  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' })
  // Second guard: respect the cap even when the picker doesn't report fileSize.
  if (base64.length * 0.75 > MAX_AVATAR_BYTES) throw new AvatarTooLargeError()

  const path = `${user.id}/avatar.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), { upsert: true, contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)

  const { publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path).data
  // Cache-bust so the new image shows immediately after an upsert overwrite.
  const url = `${publicUrl}?v=${Date.now()}`

  await updateProfile({ avatar_url: url })
  return url
}
