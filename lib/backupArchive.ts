import * as FileSystem from 'expo-file-system/legacy'
import * as Crypto from 'expo-crypto'
import { zip, unzip } from 'react-native-zip-archive'
import * as db from './db'
import * as cloudDb from './cloudDb'
import * as localDb from './localDb'
import { emitDataChange } from './dataEvents'
import { getTier } from './entitlements'
import {
  FREE_COLLECTION_CAP,
  FREE_IMPORT_CAP,
  FREE_SAVE_CAP,
  type Tier,
} from '../constants/limits'
import {
  LOCAL_MEDIA_DIR,
  importMediaFile,
  importMediaFileForTarget,
} from './storage'
import { repairMissingThumbnails } from './thumbnailRepair'
import type { AutoBackupScope } from './autoBackupCore'
import {
  MEDIA_SCHEME,
  buildCollectionImportFields,
  buildSaveImportFields,
  buildUniqueCacheDirectory,
  cleanupOnFailure,
  guardedRestoreWrite,
  isBackupZip,
  isZipFileHead,
  mapRecordsForExport,
  mergeBackupRecordsWithTarget,
  normalizeBackupPayload,
  requireSafeMediaBasename,
  toZipPath,
  validateBackupPayloadStructure,
  type AssertRestoreScope,
  type BackupRestoreTarget,
  type BackupPayload,
} from './backupArchiveCore'

export {
  BACKUP_VERSION,
  MEDIA_SCHEME,
  buildCollectionImportFields,
  buildSaveImportFields,
  buildUniqueCacheDirectory,
  bundleMediaReference,
  cleanupOnFailure,
  guardedRestoreWrite,
  isBackupZip,
  isZipFileHead,
  mapRecordsForExport,
  mergeBackupRecordsWithTarget,
  mediaSentinel,
  normalizeBackupPayload,
  parseMediaSentinel,
  requireSafeMediaBasename,
  shouldBundleLocalMedia,
  toZipPath,
  validateBackupPayloadStructure,
  type AssertRestoreScope,
  type BackupRestoreTarget,
  type BackupPayload,
} from './backupArchiveCore'

export type ImportResult = {
  saves: number
  collections: number
  thumbnailsRepaired: number
  skipped?: number
  /** Items not imported because of a free-tier cap (import or save limit). */
  limited?: number
  source?: 'trove' | 'raindrop'
}

export async function createBackupArchive(outputZipUri: string): Promise<{
  saves: number
  collections: number
}> {
  const [library, inbox, collections] = await Promise.all([
    db.fetchLibrarySaves(),
    db.fetchInboxSaves(),
    db.fetchCollections(),
  ])
  const saves = [...library, ...inbox]
  const stageDir = buildUniqueCacheDirectory(
    FileSystem.cacheDirectory ?? '',
    'backup-stage',
    Date.now(),
    Crypto.randomUUID(),
  )
  const mediaDir = `${stageDir}media/`

  try {
    await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true })
    const payload = await mapRecordsForExport(
      saves,
      collections,
      LOCAL_MEDIA_DIR,
      async (from, to) => FileSystem.copyAsync({ from, to }),
      mediaDir,
    )
    await FileSystem.writeAsStringAsync(
      `${stageDir}backup.json`,
      JSON.stringify(payload, null, 2),
    )
    await zip(toZipPath(stageDir), toZipPath(outputZipUri))
    return { saves: saves.length, collections: collections.length }
  } finally {
    FileSystem.deleteAsync(stageDir, { idempotent: true }).catch(() => {})
  }
}

export async function looksLikeZip(uri: string): Promise<boolean> {
  try {
    const head = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
      position: 0,
      length: 2,
    })
    return isZipFileHead(head)
  } catch {
    return false
  }
}

export async function validateBackupArchive(uri: string): Promise<{
  saves: number
  collections: number
}> {
  const extractDir = buildUniqueCacheDirectory(
    FileSystem.cacheDirectory ?? '',
    'validate-backup',
    Date.now(),
    Crypto.randomUUID(),
  )
  try {
    await unzip(toZipPath(uri), toZipPath(extractDir))

    let raw: string
    try {
      raw = await FileSystem.readAsStringAsync(`${extractDir}backup.json`)
    } catch {
      throw new Error('That zip does not contain a Trove backup.')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('The backup contains malformed backup.json.')
    }

    const normalized = validateBackupPayloadStructure(parsed)
    return {
      saves: normalized.saves.length,
      collections: normalized.collections.length,
    }
  } finally {
    await FileSystem.deleteAsync(extractDir, { idempotent: true }).catch(() => {})
  }
}

export async function readBackupFromUri(
  sourceUri: string,
  name?: string | null,
  mimeType?: string | null,
): Promise<{ parsed: Partial<BackupPayload>; extractDir: string | null }> {
  const isZip = isBackupZip(name, mimeType, await looksLikeZip(sourceUri))

  if (isZip) {
    const extractDir = buildUniqueCacheDirectory(
      FileSystem.cacheDirectory ?? '',
      'restore',
      Date.now(),
      Crypto.randomUUID(),
    )
    return cleanupOnFailure(
      async () => {
        await unzip(toZipPath(sourceUri), toZipPath(extractDir))
        let raw: string
        try {
          raw = await FileSystem.readAsStringAsync(`${extractDir}backup.json`)
        } catch {
          throw new Error('That zip does not contain a Trove backup.')
        }
        return { parsed: JSON.parse(raw), extractDir }
      },
      () => FileSystem.deleteAsync(extractDir, { idempotent: true }),
    )
  }

  const raw = await fetch(sourceUri).then(r => r.text())
  return { parsed: JSON.parse(raw), extractDir: null }
}

class RestoreTargetLimitError extends Error {}

function importCapForTier(tier: Tier): number {
  return tier === 'free' ? FREE_IMPORT_CAP : Infinity
}

async function importExtractedMedia(
  extractDir: string,
  filename: string,
  importer: (srcUri: string, filename: string) => Promise<string | null>,
): Promise<string | undefined> {
  const safeName = requireSafeMediaBasename(filename)
  const src = `${extractDir}media/${safeName}`
  const info = await FileSystem.getInfoAsync(src)
  if (!info.exists) return undefined
  return (await importer(src, safeName)) ?? undefined
}

function createDynamicRestoreTarget(): BackupRestoreTarget {
  return {
    importCap: importCapForTier(getTier()),
    fetchCollections: db.fetchCollections,
    createCollection: db.createCollection,
    createSave: db.createSave,
    importMedia: (extractDir, filename) =>
      importExtractedMedia(extractDir, filename, importMediaFile),
    repairMissingThumbnails,
    isLimitError: error => error instanceof db.LimitReachedError,
  }
}

export function createRestoreTargetForScope(
  scope: AutoBackupScope,
  tier: Tier = getTier(),
): BackupRestoreTarget {
  const assertCollectionCapacity = async () => {
    if (tier !== 'free') return
    const counts = scope.kind === 'cloud'
      ? await cloudDb.fetchCounts(scope.userId)
      : await localDb.fetchCounts()
    if (counts.collections >= FREE_COLLECTION_CAP) throw new RestoreTargetLimitError()
  }
  const assertSaveCapacity = async () => {
    if (tier !== 'free') return
    const counts = scope.kind === 'cloud'
      ? await cloudDb.fetchCounts(scope.userId)
      : await localDb.fetchCounts()
    if (counts.saves >= FREE_SAVE_CAP) throw new RestoreTargetLimitError()
  }

  if (scope.kind === 'cloud') {
    const expectedUserId = scope.userId
    return {
      importCap: importCapForTier(tier),
      fetchCollections: () => cloudDb.fetchCollections(expectedUserId),
      createCollection: async input => {
        await assertCollectionCapacity()
        const created = await cloudDb.createCollection(input, expectedUserId)
        if (created) emitDataChange('collections')
        return created
      },
      createSave: async input => {
        if (input.url) {
          const existing = await cloudDb.findSaveByUrl(input.url, expectedUserId)
          if (existing) return existing
        }
        await assertSaveCapacity()
        const created = await cloudDb.createSave(input, expectedUserId)
        if (created) emitDataChange('saves')
        return created
      },
      importMedia: (extractDir, filename) =>
        importExtractedMedia(
          extractDir,
          filename,
          (src, name) => importMediaFileForTarget(src, name, {
            kind: 'cloud',
            userId: expectedUserId,
          }),
        ),
      repairMissingThumbnails: async () => 0,
      isLimitError: error => error instanceof RestoreTargetLimitError,
    }
  }

  return {
    importCap: importCapForTier(tier),
    fetchCollections: localDb.fetchCollections,
    createCollection: async input => {
      await assertCollectionCapacity()
      const created = await localDb.createCollection(input)
      if (created) emitDataChange('collections')
      return created
    },
    createSave: async input => {
      if (input.url) {
        const existing = await localDb.findSaveByUrl(input.url)
        if (existing) return existing
      }
      await assertSaveCapacity()
      const created = await localDb.createSave(input)
      if (created) emitDataChange('saves')
      return created
    },
    importMedia: (extractDir, filename) =>
      importExtractedMedia(
        extractDir,
        filename,
        (src, name) => importMediaFileForTarget(src, name, { kind: 'local' }),
      ),
    repairMissingThumbnails: async () => 0,
    isLimitError: error => error instanceof RestoreTargetLimitError,
  }
}

export async function mergeRestoreFromPayload(
  parsed: Partial<BackupPayload>,
  extractDir: string | null,
  options?: {
    assertScope?: AssertRestoreScope
    target?: BackupRestoreTarget
  },
): Promise<ImportResult> {
  const { collections, saves } = normalizeBackupPayload(parsed)
  if (!collections.length && !saves.length) {
    throw new Error('No saves or collections found in that file.')
  }
  return mergeBackupRecordsWithTarget(
    { collections, saves },
    extractDir,
    options?.target ?? createDynamicRestoreTarget(),
    options?.assertScope,
  )
}

export async function mergeRestoreFromBackupUri(
  sourceUri: string,
  options?: {
    name?: string | null
    mimeType?: string | null
    assertScope?: AssertRestoreScope
    target?: BackupRestoreTarget
  },
): Promise<ImportResult> {
  let extractDir: string | null = null
  try {
    const { parsed, extractDir: dir } = await readBackupFromUri(
      sourceUri,
      options?.name,
      options?.mimeType,
    )
    extractDir = dir
    return await mergeRestoreFromPayload(parsed, extractDir, {
      assertScope: options?.assertScope,
      target: options?.target,
    })
  } finally {
    if (extractDir) FileSystem.deleteAsync(extractDir, { idempotent: true }).catch(() => {})
  }
}
