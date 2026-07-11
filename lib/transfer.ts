import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import * as DocumentPicker from 'expo-document-picker'
import { Platform } from 'react-native'
import { zip, unzip } from 'react-native-zip-archive'
import { Save, Collection } from '../types'
import * as db from './db'
import { LOCAL_MEDIA_DIR, importMediaFile } from './storage'
import { repairMissingThumbnails } from './thumbnailRepair'
import { importRaindropCsv, isRaindropCsv } from './raindropImport'

// Manual backup / restore. Routes through lib/db.ts, so it reads/writes the
// local store when logged out and the cloud when signed in. Mainly the
// no-account escape hatch for moving data between devices.
//
// v2 backups are a .zip: backup.json plus a media/ folder holding any
// device-local (file://) images and videos, so image/video saves survive a
// restore on another device. Media refs inside the JSON use the
// trove-media://<filename> sentinel; cloud https URLs pass through untouched
// (the account itself is the cloud backup). v1 plain-JSON backups still import.

const VERSION = 2
const MEDIA_SCHEME = 'trove-media://'

type Backup = {
  version: number
  exportedAt: string
  saves: Save[]
  collections: Collection[]
}

// react-native-zip-archive wants plain filesystem paths, not file:// URIs.
const toPath = (uri: string) => uri.replace(/^file:\/\//, '')

export async function exportData(): Promise<{ saves: number; collections: number }> {
  const [library, inbox, collections] = await Promise.all([
    db.fetchLibrarySaves(),
    db.fetchInboxSaves(),
    db.fetchCollections(),
  ])
  const saves = [...library, ...inbox]

  const stamp = Date.now()
  const filename = `trove-backup-${stamp}.zip`
  const stageDir = `${FileSystem.cacheDirectory}backup-stage-${stamp}/`
  const mediaDir = `${stageDir}media/`
  const zipUri = `${FileSystem.cacheDirectory}${filename}`

  try {
    await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true })

    // Copy device-local media into the stage and swap the save's URI for the
    // sentinel. Anything else (https URLs, notes) passes through unchanged.
    const bundled = new Set<string>()
    const bundleUri = async (uri?: string): Promise<string | undefined> => {
      if (!uri || !uri.startsWith(LOCAL_MEDIA_DIR)) return uri
      const name = uri.slice(LOCAL_MEDIA_DIR.length)
      if (!bundled.has(name)) {
        try {
          await FileSystem.copyAsync({ from: uri, to: `${mediaDir}${name}` })
          bundled.add(name)
        } catch {
          return uri // file vanished from disk — keep the original ref
        }
      }
      return `${MEDIA_SCHEME}${name}`
    }

    const exportSaves: Save[] = []
    for (const s of saves) {
      exportSaves.push({ ...s, url: await bundleUri(s.url), image_url: await bundleUri(s.image_url) })
    }

    const payload: Backup = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      saves: exportSaves,
      collections,
    }
    await FileSystem.writeAsStringAsync(`${stageDir}backup.json`, JSON.stringify(payload, null, 2))

    await zip(toPath(stageDir), toPath(zipUri))

    if (Platform.OS === 'android') {
      // SAF: user picks a folder and the zip lands directly there.
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
      if (!permissions.granted) return { saves: saves.length, collections: collections.length }

      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        filename,
        'application/zip',
      )
      const b64 = await FileSystem.readAsStringAsync(zipUri, { encoding: 'base64' })
      await FileSystem.writeAsStringAsync(destUri, b64, { encoding: 'base64' })
    } else if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(zipUri, {
        mimeType: 'application/zip',
        dialogTitle: 'Save Trove backup',
        UTI: 'public.zip-archive',
      })
    }

    return { saves: saves.length, collections: collections.length }
  } finally {
    FileSystem.deleteAsync(stageDir, { idempotent: true }).catch(() => {})
    FileSystem.deleteAsync(zipUri, { idempotent: true }).catch(() => {})
  }
}

// Zip files start with the bytes "PK" ("UEs..." in base64) — used to catch
// zips that arrive as application/octet-stream without a .zip name.
async function looksLikeZip(uri: string): Promise<boolean> {
  try {
    const head = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
      position: 0,
      length: 2,
    })
    return head.startsWith('UEs')
  } catch {
    return false
  }
}

export type ImportResult = {
  saves: number
  collections: number
  thumbnailsRepaired: number
  skipped?: number
  source?: 'trove' | 'raindrop'
}

// Returns null if the user cancels the file picker.
export async function importData(): Promise<ImportResult | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'application/zip',
      'application/json',
      'application/octet-stream',
      'text/csv',
      'text/comma-separated-values',
      'application/csv',
      'text/plain',
    ],
    copyToCacheDirectory: true,
  })
  if (res.canceled || !res.assets?.length) return null
  const asset = res.assets[0]

  let extractDir: string | null = null

  try {
    let parsed: Partial<Backup>

    const isZip =
      asset.name?.toLowerCase().endsWith('.zip') ||
      asset.mimeType === 'application/zip' ||
      (await looksLikeZip(asset.uri))

    if (isZip) {
      extractDir = `${FileSystem.cacheDirectory}restore-${Date.now()}/`
      await unzip(toPath(asset.uri), toPath(extractDir))
      let raw: string
      try {
        raw = await FileSystem.readAsStringAsync(`${extractDir}backup.json`)
      } catch {
        throw new Error('That zip does not contain a Trove backup.')
      }
      parsed = JSON.parse(raw)
    } else {
      const raw = await fetch(asset.uri).then(r => r.text())
      if (isRaindropCsv(raw)) {
        return importRaindropCsv(raw)
      }
      try {
        parsed = JSON.parse(raw)
      } catch {
        throw new Error('Unrecognized file. Use a Trove backup or a Raindrop CSV export.')
      }
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
          created_at: c.created_at,
        })
        if (!created) continue
        targetId = created.id
        byName.set(key, targetId)
        importedCollections++
      }
      idMap[c.id] = targetId
    }

    // Bundled media refs get restored into the active backend (local dir when
    // signed out, Storage upload when signed in). A ref whose file is missing
    // from the zip imports without media rather than failing the save.
    const restoredMedia = new Map<string, string>()
    const resolveMedia = async (val?: string): Promise<string | undefined> => {
      if (!val?.startsWith(MEDIA_SCHEME)) return val
      const name = val.slice(MEDIA_SCHEME.length)
      const cached = restoredMedia.get(name)
      if (cached) return cached
      if (!extractDir) return undefined
      const src = `${extractDir}media/${name}`
      const info = await FileSystem.getInfoAsync(src)
      if (!info.exists) return undefined
      const restored = await importMediaFile(src, name)
      if (restored) restoredMedia.set(name, restored)
      return restored ?? undefined
    }

    let importedSaves = 0
    const createdSaves: Save[] = []
    for (const s of saves) {
      if (!s?.title) continue
      const created = await db.createSave({
        url: await resolveMedia(s.url),
        title: s.title,
        description: s.description,
        type: s.type ?? 'link',
        content: s.content,
        image_url: await resolveMedia(s.image_url),
        collection_id: s.collection_id ? idMap[s.collection_id] : undefined,
        tags: s.tags,
        is_inbox: s.is_inbox,
        is_favorite: s.is_favorite,
        created_at: s.created_at,
      })
      if (created) {
        importedSaves++
        createdSaves.push(created)
      }
    }

    const thumbnailsRepaired = await repairMissingThumbnails(createdSaves)

    return {
      saves: importedSaves,
      collections: importedCollections,
      thumbnailsRepaired,
      source: 'trove',
    }
  } finally {
    if (extractDir) FileSystem.deleteAsync(extractDir, { idempotent: true }).catch(() => {})
  }
}
