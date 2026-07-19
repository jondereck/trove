import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as Crypto from 'expo-crypto'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'
import { updateProfile } from './cloudDb'
import { isLoggedIn } from './session'
import { hasCloud } from './entitlements'
import { requireSafeMediaBasename } from './backupArchiveCore'

const BUCKET = 'media'
const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2 MB cap on avatar uploads
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const LOCAL_MEDIA_DIR = `${FileSystem.documentDirectory}media/`

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

// Cloud subscribers: uploads a gallery-picked image/video (base64) to the
// public `media` bucket, namespaced under the user's id so the storage RLS
// policy can scope writes per user. Everyone else (guest or signed-in without
// the Cloud sub): saves it on-device, so media saves work fully offline.
export async function uploadMedia(
  base64: string,
  ext: string,
  contentType: string
): Promise<string | null> {
  if (!isLoggedIn() || !hasCloud()) return saveMediaLocally(base64, ext)
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

export class MediaTooLargeError extends Error {
  constructor(kind: 'image' | 'video', actualBytes: number, maxBytes: number) {
    const actual = (actualBytes / (1024 * 1024)).toFixed(1)
    const max = Math.round(maxBytes / (1024 * 1024))
    super(
      kind === 'video'
        ? `Videos up to ${max} MB can be saved (this one is ${actual} MB). Try a shorter or trimmed clip.`
        : `Photos up to ${max} MB can be saved (this one is still ${actual} MB after compression). Try a smaller photo.`
    )
    this.name = 'MediaTooLargeError'
  }
}

// Validates and normalizes a gallery pick before upload: videos over the cap
// are rejected outright (checked from fileSize before the bytes are read into
// memory), oversized photos get downscaled to 1920px JPEG and only rejected if
// they still exceed the cap.
export async function prepareMediaForUpload(
  asset: ImagePicker.ImagePickerAsset,
  kind: 'image' | 'video'
): Promise<{ base64: string; ext: string; mime: string }> {
  const mime = asset.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg')
  const ext = mime.split('/')[1] ?? (kind === 'video' ? 'mp4' : 'jpg')

  if (kind === 'video') {
    if (asset.fileSize && asset.fileSize > MAX_VIDEO_BYTES) {
      throw new MediaTooLargeError('video', asset.fileSize, MAX_VIDEO_BYTES)
    }
    const base64 =
      asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' }))
    const bytes = asset.fileSize ?? base64.length * 0.75
    if (bytes > MAX_VIDEO_BYTES) throw new MediaTooLargeError('video', bytes, MAX_VIDEO_BYTES)
    return { base64, ext, mime }
  }

  const base64 =
    asset.base64 ?? (await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' }))
  const bytes = asset.fileSize ?? base64.length * 0.75
  if (bytes <= MAX_IMAGE_BYTES) return { base64, ext, mime }

  const context = ImageManipulator.manipulate(asset.uri)
  context.resize({ width: 1920, height: null })
  const rendered = await context.renderAsync()
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true })
  const resizedBytes = (result.base64?.length ?? 0) * 0.75
  if (!result.base64 || resizedBytes > MAX_IMAGE_BYTES) {
    throw new MediaTooLargeError('image', resizedBytes || bytes, MAX_IMAGE_BYTES)
  }
  return { base64: result.base64, ext: 'jpg', mime: 'image/jpeg' }
}

// Brings a media file from an extracted backup into the active backend:
// local media dir by default (no base64 round-trip), Storage upload for
// Cloud subscribers so the restored save never points at a dead file:// path.
export async function importMediaFile(srcUri: string, filename: string): Promise<string | null> {
  const safeName = requireSafeMediaBasename(filename)
  try {
    if (isLoggedIn() && hasCloud()) {
      const base64 = await FileSystem.readAsStringAsync(srcUri, { encoding: 'base64' })
      const ext = safeName.split('.').pop() ?? 'jpg'
      const contentType = ext === 'mp4' ? 'video/mp4' : `image/${ext}`
      return await uploadMedia(base64, ext, contentType)
    }
    const dirInfo = await FileSystem.getInfoAsync(LOCAL_MEDIA_DIR)
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(LOCAL_MEDIA_DIR, { intermediates: true })
    }
    const dest = `${LOCAL_MEDIA_DIR}${Date.now()}-${safeName}`
    await FileSystem.copyAsync({ from: srcUri, to: dest })
    return dest
  } catch (e) {
    console.error('importMediaFile:', e)
    return null
  }
}

export async function importMediaFileForTarget(
  srcUri: string,
  filename: string,
  target: { kind: 'local' } | { kind: 'cloud'; userId: string },
): Promise<string | null> {
  const safeName = requireSafeMediaBasename(filename)
  if (target.kind === 'cloud') {
    const base64 = await FileSystem.readAsStringAsync(srcUri, { encoding: 'base64' })
    const ext = safeName.split('.').pop() ?? 'jpg'
    const contentType = ext === 'mp4' ? 'video/mp4' : `image/${ext}`
    const path = `${target.userId}/${Date.now()}-${Crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, decode(base64), { contentType, upsert: false })
    if (error) throw new Error(`importMediaFile: ${error.message}`)
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  }

  try {
    const dirInfo = await FileSystem.getInfoAsync(LOCAL_MEDIA_DIR)
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(LOCAL_MEDIA_DIR, { intermediates: true })
    }
    const dest = `${LOCAL_MEDIA_DIR}${Date.now()}-${Crypto.randomUUID()}-${safeName}`
    await FileSystem.copyAsync({ from: srcUri, to: dest })
    return dest
  } catch (error) {
    console.error('importMediaFileForTarget:', error)
    return null
  }
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

/** Pick a photo for a collection cover. Works signed-in (Storage) or guest (local FS). */
export async function pickAndUploadCollectionCover(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new Error('Photo access is needed to set a collection cover.')

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.75,
  })
  if (result.canceled || !result.assets?.length) return null

  const prepared = await prepareMediaForUpload(result.assets[0], 'image')
  return uploadMedia(prepared.base64, prepared.ext, prepared.mime)
}
