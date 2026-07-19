import { Save, Collection } from '../types'

export const BACKUP_VERSION = 2
export const MEDIA_SCHEME = 'trove-media://'

export type BackupPayload = {
  version: number
  exportedAt: string
  saves: Save[]
  collections: Collection[]
}

export type AssertRestoreScope = () => void | Promise<void>
export type RestoreCollectionInput = ReturnType<typeof buildCollectionImportFields>
export type RestoreSaveInput = ReturnType<typeof buildSaveImportFields>

export interface BackupRestoreTarget {
  importCap: number
  fetchCollections: () => Promise<Collection[]>
  createCollection: (input: RestoreCollectionInput) => Promise<Collection | null>
  createSave: (input: RestoreSaveInput) => Promise<Save | null>
  importMedia: (extractDir: string, filename: string) => Promise<string | null | undefined>
  repairMissingThumbnails: (saves: Save[]) => Promise<number>
  isLimitError: (error: unknown) => boolean
}

export type BackupRestoreMergeResult = {
  saves: number
  collections: number
  thumbnailsRepaired: number
  limited?: number
  source: 'trove'
}

export function buildUniqueCacheDirectory(
  cacheDirectory: string,
  prefix: string,
  timestampMs: number,
  uniqueId: string,
): string {
  return `${cacheDirectory}${prefix}-${timestampMs}-${uniqueId}/`
}

export async function guardedRestoreWrite<T>(
  assertScope: AssertRestoreScope | undefined,
  write: () => Promise<T>,
): Promise<T> {
  await assertScope?.()
  const result = await write()
  await assertScope?.()
  return result
}

export function toZipPath(uri: string): string {
  return uri.replace(/^file:\/\//, '')
}

export function isZipFileHead(base64Head: string): boolean {
  return base64Head.startsWith('UEs')
}

export function isBackupZip(
  name: string | null | undefined,
  mimeType: string | null | undefined,
  hasZipMagic: boolean,
): boolean {
  return !!(
    name?.toLowerCase().endsWith('.zip') ||
    mimeType === 'application/zip' ||
    hasZipMagic
  )
}

export async function cleanupOnFailure<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    try {
      await cleanup()
    } catch {
      // Preserve the operation error; cleanup is best-effort.
    }
    throw error
  }
}

export function mediaSentinel(name: string): string {
  return `${MEDIA_SCHEME}${requireSafeMediaBasename(name)}`
}

export function parseMediaSentinel(val?: string): string | undefined {
  if (!val?.startsWith(MEDIA_SCHEME)) return undefined
  return requireSafeMediaBasename(val.slice(MEDIA_SCHEME.length))
}

export function requireSafeMediaBasename(name: string): string {
  const unsafe = (): never => {
    throw new Error('The backup contains an unsafe media filename.')
  }
  const assertSafe = (candidate: string) => {
    if (
      !candidate.trim() ||
      candidate === '.' ||
      candidate === '..' ||
      /[\/\\]/.test(candidate) ||
      /[\u0000-\u001f\u007f-\u009f]/.test(candidate) ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(candidate)
    ) {
      unsafe()
    }
  }

  let decoded = name
  const seen = new Set<string>()
  while (true) {
    assertSafe(decoded)
    if (!decoded.includes('%')) break
    if (seen.has(decoded)) unsafe()
    seen.add(decoded)
    let next = ''
    try {
      next = decodeURIComponent(decoded)
    } catch {
      unsafe()
    }
    if (next === decoded) break
    decoded = next
  }
  return name
}

export function assertSafeMediaReferences(records: {
  collections: Collection[]
  saves: Save[]
}): void {
  const assertReference = (value?: string | null) => {
    if (value?.startsWith(MEDIA_SCHEME)) parseMediaSentinel(value)
  }
  for (const save of records.saves) {
    assertReference(save?.url)
    assertReference(save?.image_url)
  }
  for (const collection of records.collections) {
    assertReference(collection?.cover_image_url)
  }
}

export function shouldBundleLocalMedia(
  uri: string | undefined | null,
  localMediaDir: string,
): boolean {
  return !!uri && uri.startsWith(localMediaDir)
}

export function bundleMediaReference(
  uri: string | undefined,
  localMediaDir: string,
  bundled: Set<string>,
): { exportUri: string | undefined; copyFrom?: string; copyName?: string } {
  if (!uri) return { exportUri: undefined }
  if (!uri.startsWith(localMediaDir)) return { exportUri: uri }
  const name = uri.slice(localMediaDir.length)
  if (!bundled.has(name)) {
    return { exportUri: mediaSentinel(name), copyFrom: uri, copyName: name }
  }
  return { exportUri: mediaSentinel(name) }
}

export function buildSaveImportFields(
  save: Partial<Save>,
  idMap: Record<string, string>,
  media: { url?: string; image_url?: string },
) {
  return {
    url: media.url,
    title: save.title!,
    description: save.description,
    type: save.type ?? 'link',
    content: save.content,
    image_url: media.image_url,
    collection_id: save.collection_id ? idMap[save.collection_id] : undefined,
    tags: save.tags,
    is_inbox: save.is_inbox,
    is_favorite: save.is_favorite,
    is_pinned: save.is_pinned,
    is_viewed: save.is_viewed,
    created_at: save.created_at,
  }
}

export function buildCollectionImportFields(
  collection: Partial<Collection>,
  cover?: string | null,
) {
  return {
    name: collection.name!,
    icon: collection.icon,
    color: collection.color,
    description: collection.description,
    cover_image_url: cover ?? collection.cover_image_url,
    is_pinned: collection.is_pinned,
    created_at: collection.created_at,
  }
}

export async function mergeBackupRecordsWithTarget(
  records: { collections: Collection[]; saves: Save[] },
  extractDir: string | null,
  target: BackupRestoreTarget,
  assertScope?: AssertRestoreScope,
): Promise<BackupRestoreMergeResult> {
  assertSafeMediaReferences(records)
  await assertScope?.()
  const existing = await target.fetchCollections()
  const byName = new Map(existing.map(collection => [
    collection.name.toLowerCase(),
    collection.id,
  ]))
  const idMap: Record<string, string> = {}
  let importedCollections = 0

  const restoredMedia = new Map<string, string>()
  const resolveMedia = async (value?: string): Promise<string | undefined> => {
    const name = parseMediaSentinel(value)
    if (!name) return value
    const cached = restoredMedia.get(name)
    if (cached) return cached
    if (!extractDir) return undefined
    const restored = await target.importMedia(extractDir, name)
    if (restored) restoredMedia.set(name, restored)
    return restored ?? undefined
  }

  for (const collection of records.collections) {
    if (!collection?.name) continue
    const key = collection.name.toLowerCase()
    let targetId = byName.get(key)
    if (!targetId) {
      try {
        const fields = buildCollectionImportFields(
          collection,
          await resolveMedia(collection.cover_image_url ?? undefined),
        )
        const created = await guardedRestoreWrite(
          assertScope,
          () => target.createCollection(fields),
        )
        if (!created) continue
        targetId = created.id
        byName.set(key, targetId)
        importedCollections++
      } catch (error) {
        if (target.isLimitError(error)) continue
        throw error
      }
    }
    idMap[collection.id] = targetId
  }

  let importedSaves = 0
  let limited = 0
  const createdSaves: Save[] = []
  for (const save of records.saves) {
    if (!save?.title) continue
    if (importedSaves >= target.importCap) {
      limited++
      continue
    }
    try {
      const fields = buildSaveImportFields(save, idMap, {
        url: await resolveMedia(save.url),
        image_url: await resolveMedia(save.image_url),
      })
      const created = await guardedRestoreWrite(
        assertScope,
        () => target.createSave(fields),
      )
      if (created) {
        importedSaves++
        createdSaves.push(created)
      }
    } catch (error) {
      if (target.isLimitError(error)) {
        limited++
        continue
      }
      throw error
    }
  }

  await assertScope?.()
  const thumbnailsRepaired = await target.repairMissingThumbnails(createdSaves)
  return {
    saves: importedSaves,
    collections: importedCollections,
    thumbnailsRepaired,
    limited: limited || undefined,
    source: 'trove',
  }
}

export function normalizeBackupPayload(parsed: Partial<BackupPayload>): {
  collections: Collection[]
  saves: Save[]
} {
  return {
    collections: Array.isArray(parsed.collections) ? parsed.collections : [],
    saves: Array.isArray(parsed.saves) ? parsed.saves : [],
  }
}

export function validateBackupPayloadStructure(value: unknown): {
  collections: Collection[]
  saves: Save[]
} {
  if (!value || typeof value !== 'object') {
    throw new Error('That archive is not a valid Trove backup.')
  }

  const parsed = value as Partial<BackupPayload>
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${String(parsed.version)}.`)
  }
  if (
    typeof parsed.exportedAt !== 'string' ||
    Number.isNaN(Date.parse(parsed.exportedAt)) ||
    !Array.isArray(parsed.saves) ||
    !Array.isArray(parsed.collections)
  ) {
    throw new Error('That archive is not a valid Trove backup.')
  }

  const isNonemptyString = (field: unknown) =>
    typeof field === 'string' && field.trim().length > 0
  const isDateString = (field: unknown) =>
    isNonemptyString(field) && !Number.isNaN(Date.parse(field as string))
  const saveTypes = new Set(['link', 'image', 'video', 'note'])

  for (const save of parsed.saves) {
    const record = save as Partial<Save> | null
    if (
      !record ||
      typeof record !== 'object' ||
      !isNonemptyString(record.id) ||
      !isNonemptyString(record.title) ||
      !saveTypes.has(String(record.type)) ||
      !isDateString(record.created_at) ||
      !Array.isArray(record.tags) ||
      record.tags.some(tag => typeof tag !== 'string')
    ) {
      throw new Error('The backup contains an invalid save record.')
    }
  }

  for (const collection of parsed.collections) {
    const record = collection as Partial<Collection> | null
    if (
      !record ||
      typeof record !== 'object' ||
      !isNonemptyString(record.id) ||
      !isNonemptyString(record.name) ||
      !isDateString(record.created_at)
    ) {
      throw new Error('The backup contains an invalid collection record.')
    }
  }

  const normalized = normalizeBackupPayload(parsed)
  assertSafeMediaReferences(normalized)
  return normalized
}

type CopyFile = (from: string, to: string) => Promise<void>

export async function mapRecordsForExport(
  saves: Save[],
  collections: Collection[],
  localMediaDir: string,
  copyFile: CopyFile,
  mediaDir: string,
): Promise<BackupPayload> {
  const bundled = new Set<string>()

  const bundleUri = async (uri?: string | null): Promise<string | undefined> => {
    if (!uri) return undefined
    const ref = bundleMediaReference(uri, localMediaDir, bundled)
    if (ref.copyFrom && ref.copyName) {
      try {
        await copyFile(ref.copyFrom, `${mediaDir}${ref.copyName}`)
        bundled.add(ref.copyName)
      } catch {
        return uri
      }
    }
    return ref.exportUri
  }

  const exportSaves: Save[] = []
  for (const s of saves) {
    exportSaves.push({
      ...s,
      url: await bundleUri(s.url),
      image_url: await bundleUri(s.image_url),
    })
  }

  const exportCollections: Collection[] = []
  for (const c of collections) {
    exportCollections.push({
      ...c,
      cover_image_url: (await bundleUri(c.cover_image_url)) ?? c.cover_image_url,
    })
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    saves: exportSaves,
    collections: exportCollections,
  }
}
