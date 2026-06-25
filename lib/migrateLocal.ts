import * as cloud from './cloudDb'
import { clearLocalData, loadLocalData } from './localDb'

// One-shot upload of device-local saves/collections into the freshly signed-in
// user's cloud account. Called from app/_layout.tsx on the SIGNED_IN event.
//
// Collections are created first to build a localId → cloudId map, then saves are
// recreated with their collection_id remapped. createSave dedupes by URL, so a
// re-run can't duplicate links. On success the local store is cleared.

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
      url: s.url,
      title: s.title,
      description: s.description,
      type: s.type,
      content: s.content,
      image_url: s.image_url,
      collection_id: s.collection_id ? idMap[s.collection_id] : undefined,
      tags: s.tags,
      is_inbox: s.is_inbox,
    })
    if (created) migratedSaves++
  }

  await clearLocalData()
  return { saves: migratedSaves, collections: migratedCollections }
}
