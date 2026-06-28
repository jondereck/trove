import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as DocumentPicker from 'expo-document-picker'
import { Platform } from 'react-native'
import { Save, Collection } from '../types'
import * as db from './db'

// Manual JSON backup / restore. Routes through lib/db.ts, so it writes to the
// local store when logged out and to the cloud when signed in. Mainly the
// no-account escape hatch for moving data between devices.

const VERSION = 1

type Backup = {
  version: number
  exportedAt: string
  saves: Save[]
  collections: Collection[]
}

export async function exportData(): Promise<{ saves: number; collections: number }> {
  const [library, inbox, collections] = await Promise.all([
    db.fetchLibrarySaves(),
    db.fetchInboxSaves(),
    db.fetchCollections(),
  ])
  const saves = [...library, ...inbox]

  const payload: Backup = { version: VERSION, exportedAt: new Date().toISOString(), saves, collections }
  const filename = `trove-backup-${Date.now()}.json`
  const json = JSON.stringify(payload, null, 2)

  if (Platform.OS === 'android') {
    // On Android, use SAF to let the user pick a folder and save directly there
    // (no Share sheet — the file lands in the chosen directory).
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
    if (!permissions.granted) return { saves: saves.length, collections: collections.length }

    const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      filename,
      'application/json',
    )
    await FileSystem.writeAsStringAsync(destUri, json, { encoding: FileSystem.EncodingType.UTF8 })
  } else {
    // On iOS, the Share sheet is the native way to "Save to Files".
    const cacheUri = `${FileSystem.cacheDirectory}${filename}`
    await FileSystem.writeAsStringAsync(cacheUri, json)
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(cacheUri, {
        mimeType: 'application/json',
        dialogTitle: 'Save Trove backup',
        UTI: 'public.json',
      })
    }
  }

  return { saves: saves.length, collections: collections.length }
}

// Returns null if the user cancels the file picker.
export async function importData(): Promise<{ saves: number; collections: number } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  })
  if (res.canceled || !res.assets?.length) return null

  const raw = await fetch(res.assets[0].uri).then(r => r.text())
  let parsed: Partial<Backup>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('That file is not valid Trove JSON.')
  }

  const collections = Array.isArray(parsed.collections) ? parsed.collections : []
  const saves = Array.isArray(parsed.saves) ? parsed.saves : []
  if (!collections.length && !saves.length) {
    throw new Error('No saves or collections found in that file.')
  }

  // Reuse existing same-named collections so re-importing doesn't fork them;
  // remap each imported collection_id to the target id.
  const existing = await db.fetchCollections()
  const byName = new Map(existing.map(c => [c.name.toLowerCase(), c.id]))
  const idMap: Record<string, string> = {}
  let importedCollections = 0

  for (const c of collections) {
    if (!c?.name) continue
    const key = c.name.toLowerCase()
    let targetId = byName.get(key)
    if (!targetId) {
      const created = await db.createCollection({
        name: c.name,
        icon: c.icon,
        color: c.color,
        description: c.description,
      })
      if (!created) continue
      targetId = created.id
      byName.set(key, targetId)
      importedCollections++
    }
    idMap[c.id] = targetId
  }

  let importedSaves = 0
  for (const s of saves) {
    if (!s?.title) continue
    const created = await db.createSave({
      url: s.url,
      title: s.title,
      description: s.description,
      type: s.type ?? 'link',
      content: s.content,
      image_url: s.image_url,
      collection_id: s.collection_id ? idMap[s.collection_id] : undefined,
      tags: s.tags,
      is_inbox: s.is_inbox,
    })
    if (created) importedSaves++
  }

  return { saves: importedSaves, collections: importedCollections }
}
