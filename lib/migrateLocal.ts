import * as FileSystem from 'expo-file-system/legacy'
import * as cloud from './cloudDb'
import { clearLocalData, loadLocalData } from './localDb'
import { LOCAL_MEDIA_DIR, uploadMedia } from './storage'

// One-shot upload of device-local saves/collections into the freshly signed-in
// user's cloud account. Called from app/_layout.tsx on the SIGNED_IN event.
//
// Collections are created first to build a localId → cloudId map, then saves are
// recreated with their collection_id remapped. createSave dedupes by URL, so a
// re-run can't duplicate links. On success the local store is cleared.

// Image/video saves made while signed out point at a file:// URI in on-device
// storage (see lib/storage.ts saveMediaLocally). That path is only valid on
// this device, so re-upload the bytes to cloud storage before handing the URL
// off to the user's new account — otherwise the migrated save shows a broken
// image everywhere but here.
async function migrateLocalMediaUri(uri: string): Promise<string> {
  if (!uri.startsWith(LOCAL_MEDIA_DIR)) return uri
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
    const ext = uri.split('.').pop() ?? 'jpg'
    const contentType = ext === 'mp4' ? 'video/mp4' : `image/${ext}`
    const uploaded = await uploadMedia(base64, ext, contentType)
    return uploaded ?? uri
  } catch (e) {
    console.error('migrateLocalMediaUri:', e)
    return uri
  }
}

export async function migrateLocalToCloud(): Promise<{ saves: number; collections: number }> {
  const { saves, collections } = await loadLocalData()
  if (!saves.length && !collections.length) return { saves: 0, collections: 0 }

  const idMap: Record<string, string> = {}
  let migratedCollections = 0
  for (const c of collections) {
    const created = await cloud.createCollection({
      name: c.name,
      icon: c.icon,
      color: c.color,
      description: c.description,
    })
    if (created) {
      idMap[c.id] = created.id
      migratedCollections++
    }
  }

  let migratedSaves = 0
  for (const s of saves) {
    const created = await cloud.createSave({
      url: s.url ? await migrateLocalMediaUri(s.url) : s.url,
      title: s.title,
      description: s.description,
      type: s.type,
      content: s.content,
      image_url: s.image_url ? await migrateLocalMediaUri(s.image_url) : s.image_url,
      collection_id: s.collection_id ? idMap[s.collection_id] : undefined,
      tags: s.tags,
      is_inbox: s.is_inbox,
    })
    if (created) migratedSaves++
  }

  await clearLocalData()
  return { saves: migratedSaves, collections: migratedCollections }
}
