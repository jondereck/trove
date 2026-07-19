import type { Settings } from './settings'
import type { BackupRestoreTarget } from './backupArchiveCore'
import {
  buildSnapshotFilename,
  chooseSnapshotsToPrune,
  deriveLastSavedDayKey,
  isAutoBackupDue,
  localCalendarDayKey,
  parseSnapshotFilename,
  resolveAutoBackupScope,
  scopeNamespace,
  sortSnapshots,
  type AutoBackupScope,
} from './autoBackupCore'

export type AutoBackupSnapshot = {
  id: string
  uri: string
  dayKey: string
  timestampMs: number
  timestamp: string
  date: string
  saves?: number
  collections?: number
}

type AutoBackupSnapshotMetadata = {
  id: string
  exportedAt: string
  saves: number
  collections: number
}

export type AutoBackupStatus = {
  enabled: boolean
  available: boolean
  scope: string
  lastSavedDayKey: string | null
  lastSavedAt: string | null
  due: boolean
  snapshotCount: number
  snapshots: AutoBackupSnapshot[]
}

export type AutoBackupRunResult = {
  ran: boolean
  skipped?: 'disabled' | 'not_due' | 'web' | 'in_progress'
  success?: boolean
  snapshot?: AutoBackupSnapshot
  error?: string
}

export type AutoBackupRestoreResult = {
  saves: number
  collections: number
  thumbnailsRepaired: number
  skipped?: number
  limited?: number
  source?: 'trove' | 'raindrop'
}

export type AutoBackupLock = {
  tryAcquire: () => boolean
  release: () => void
}

export function createAutoBackupLock(): AutoBackupLock {
  let held = false
  return {
    tryAcquire: () => {
      if (held) return false
      held = true
      return true
    },
    release: () => {
      held = false
    },
  }
}

const processWideAutoBackupLock = createAutoBackupLock()
let fallbackCacheSequence = 0

export type AutoBackupDeps = {
  platform: string
  getSettings: () => Promise<Settings>
  isLoggedIn: () => boolean
  hasCloud: () => boolean
  getUserId: () => string | null
  documentDirectory: string
  cacheDirectory: string
  createBackupArchive: (outputZipUri: string) => Promise<{ saves: number; collections: number }>
  mergeRestoreFromBackupUri: (
    sourceUri: string,
    options?: {
      name?: string | null
      mimeType?: string | null
      assertScope?: () => void | Promise<void>
      target?: BackupRestoreTarget
    },
  ) => Promise<AutoBackupRestoreResult>
  createRestoreTarget: (scope: AutoBackupScope) => BackupRestoreTarget
  validateBackupArchive: (uri: string) => Promise<unknown>
  makeDirectoryAsync: (uri: string, options?: { intermediates?: boolean }) => Promise<void>
  readDirectoryAsync: (uri: string) => Promise<string[]>
  readAsStringAsync: (uri: string) => Promise<string>
  writeAsStringAsync: (uri: string, content: string) => Promise<void>
  getInfoAsync: (uri: string) => Promise<{ exists: boolean; size?: number; isDirectory?: boolean }>
  copyAsync: (options: { from: string; to: string }) => Promise<void>
  moveAsync: (options: { from: string; to: string }) => Promise<void>
  deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>
  now: () => Date
  lock?: AutoBackupLock
  createCacheId?: () => string
  shareBackup?: (uri: string) => Promise<void>
}

type ResolvedBackupScope = {
  namespace: string
  dir: string
  targetScope: AutoBackupScope
}

function resolveScope(deps: AutoBackupDeps): ResolvedBackupScope {
  const scope = resolveAutoBackupScope(deps.isLoggedIn(), deps.hasCloud(), deps.getUserId())
  const namespace = scopeNamespace(scope)
  return {
    namespace,
    dir: `${deps.documentDirectory}backups/${namespace}/`,
    targetScope: scope,
  }
}

function assertScopeUnchanged(
  deps: AutoBackupDeps,
  scope: ResolvedBackupScope,
): void {
  if (resolveScope(deps).namespace !== scope.namespace) {
    throw new Error('Active data scope changed during automatic backup.')
  }
}

function snapshotFromFilename(filename: string, dir: string): AutoBackupSnapshot | null {
  const parsed = parseSnapshotFilename(filename)
  if (!parsed) return null
  return {
    id: parsed.id,
    uri: `${dir}${filename}`,
    dayKey: parsed.dayKey,
    timestampMs: parsed.timestampMs,
    timestamp: new Date(parsed.timestampMs).toISOString(),
    date: parsed.dayKey,
  }
}

function metadataFilename(snapshotId: string): string {
  return `${snapshotId}.metadata.json`
}

function parseSnapshotMetadata(
  raw: string,
  expectedId: string,
  expectedTimestampMs: number,
): AutoBackupSnapshotMetadata | null {
  const MAX_COUNT = 1_000_000

  function isValidCount(value: unknown): value is number {
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= MAX_COUNT
    )
  }

  try {
    const value = JSON.parse(raw) as Partial<AutoBackupSnapshotMetadata>
    if (
      value.id !== expectedId ||
      typeof value.exportedAt !== 'string' ||
      Date.parse(value.exportedAt) !== expectedTimestampMs ||
      !isValidCount(value.saves) ||
      !isValidCount(value.collections)
    ) {
      return null
    }
    return value as AutoBackupSnapshotMetadata
  } catch {
    return null
  }
}

async function attachSnapshotMetadata(
  deps: AutoBackupDeps,
  scope: ResolvedBackupScope,
  snapshot: AutoBackupSnapshot,
): Promise<AutoBackupSnapshot> {
  try {
    const raw = await deps.readAsStringAsync(
      `${scope.dir}${metadataFilename(snapshot.id)}`,
    )
    const metadata = parseSnapshotMetadata(raw, snapshot.id, snapshot.timestampMs)
    if (!metadata) return snapshot
    return {
      ...snapshot,
      saves: metadata.saves,
      collections: metadata.collections,
    }
  } catch {
    return snapshot
  }
}

async function ensureScopeDir(
  deps: AutoBackupDeps,
  scope: ResolvedBackupScope,
): Promise<void> {
  await deps.makeDirectoryAsync(scope.dir, { intermediates: true })
}

async function listSnapshotFilenames(
  deps: AutoBackupDeps,
  scope: ResolvedBackupScope,
): Promise<string[]> {
  if (deps.platform === 'web') return []
  try {
    await ensureScopeDir(deps, scope)
    const names = await deps.readDirectoryAsync(scope.dir)
    return names.filter(name => parseSnapshotFilename(name) != null)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown filesystem error'
    throw new Error(`Unable to read automatic backups: ${detail}`)
  }
}

async function listSnapshots(
  deps: AutoBackupDeps,
  scope: ResolvedBackupScope,
): Promise<AutoBackupSnapshot[]> {
  if (deps.platform === 'web') return []
  const filenames = await listSnapshotFilenames(deps, scope)
  const snapshots = sortSnapshots(
    filenames
      .map(name => snapshotFromFilename(name, scope.dir))
      .filter((snap): snap is AutoBackupSnapshot => snap != null),
  )
  return Promise.all(
    snapshots.map(snapshot => attachSnapshotMetadata(deps, scope, snapshot)),
  )
}

function webStatus(): AutoBackupStatus {
  return {
    enabled: false,
    available: false,
    scope: 'local',
    lastSavedDayKey: null,
    lastSavedAt: null,
    due: false,
    snapshotCount: 0,
    snapshots: [],
  }
}

export function createAutoBackupService(deps: AutoBackupDeps) {
  const lock = deps.lock ?? processWideAutoBackupLock

  async function getAutoBackupStatus(): Promise<AutoBackupStatus> {
    if (deps.platform === 'web') return webStatus()

    const scope = resolveScope(deps)
    const settings = await deps.getSettings()
    const snapshots = await listSnapshots(deps, scope)
    const lastSavedDayKey = deriveLastSavedDayKey(snapshots.map(s => s.id))
    const now = deps.now()

    return {
      enabled: settings.autoBackupEnabled,
      available: true,
      scope: scope.namespace,
      lastSavedDayKey,
      lastSavedAt: snapshots[0]?.timestamp ?? null,
      due: settings.autoBackupEnabled && isAutoBackupDue(lastSavedDayKey, now),
      snapshotCount: snapshots.length,
      snapshots,
    }
  }

  async function runAutoBackupIfDue(): Promise<AutoBackupRunResult> {
    if (deps.platform === 'web') return { ran: false, skipped: 'web' }
    if (!lock.tryAcquire()) return { ran: false, skipped: 'in_progress' }

    let cacheUri: string | null = null
    let creationStarted = false

    try {
      const scope = resolveScope(deps)
      const settings = await deps.getSettings()
      if (!settings.autoBackupEnabled) return { ran: false, skipped: 'disabled' }

      const filenames = await listSnapshotFilenames(deps, scope)
      const now = deps.now()
      if (!isAutoBackupDue(deriveLastSavedDayKey(filenames), now)) {
        return { ran: false, skipped: 'not_due' }
      }

      const dayKey = localCalendarDayKey(now)
      const timestampMs = now.getTime()
      const filename = buildSnapshotFilename(dayKey, timestampMs)
      const cacheId = deps.createCacheId?.() ?? `process-${++fallbackCacheSequence}`
      cacheUri = `${deps.cacheDirectory}auto-backup-stage-${timestampMs}-${cacheId}.zip`
      await ensureScopeDir(deps, scope)
      const durableUri = `${scope.dir}${filename}`

      creationStarted = true
      const counts = await deps.createBackupArchive(cacheUri)

      const info = await deps.getInfoAsync(cacheUri)
      if (!info.exists || !info.size) {
        return { ran: true, success: false, error: 'Backup archive missing or empty.' }
      }

      await deps.validateBackupArchive(cacheUri)

      assertScopeUnchanged(deps, scope)

      await deps.moveAsync({ from: cacheUri, to: durableUri })

      const snapshot: AutoBackupSnapshot = {
        id: filename,
        uri: durableUri,
        dayKey,
        timestampMs,
        timestamp: new Date(timestampMs).toISOString(),
        date: dayKey,
        saves: counts.saves,
        collections: counts.collections,
      }

      const metadata: AutoBackupSnapshotMetadata = {
        id: filename,
        exportedAt: snapshot.timestamp,
        saves: counts.saves,
        collections: counts.collections,
      }
      await deps.writeAsStringAsync(
        `${scope.dir}${metadataFilename(filename)}`,
        JSON.stringify(metadata),
      ).catch(() => {})

      const { prune } = chooseSnapshotsToPrune([...filenames, filename])
      for (const name of prune) {
        try {
          await deps.deleteAsync(`${scope.dir}${name}`, { idempotent: true })
          await deps.deleteAsync(
            `${scope.dir}${metadataFilename(name)}`,
            { idempotent: true },
          ).catch(() => {})
        } catch {
          // Leave sidecar intact when the archive delete fails.
        }
      }

      return { ran: true, success: true, snapshot }
    } catch (e) {
      return {
        ran: creationStarted,
        success: false,
        error: e instanceof Error ? e.message : 'Automatic backup failed.',
      }
    } finally {
      lock.release()
      if (cacheUri) deps.deleteAsync(cacheUri, { idempotent: true }).catch(() => {})
    }
  }

  async function listAutoBackups(): Promise<AutoBackupSnapshot[]> {
    const scope = resolveScope(deps)
    return listSnapshots(deps, scope)
  }

  async function getLatestAutoBackup(): Promise<AutoBackupSnapshot | null> {
    const scope = resolveScope(deps)
    const snapshots = await listSnapshots(deps, scope)
    return snapshots[0] ?? null
  }

  async function restoreAutoBackup(id: string): Promise<AutoBackupRestoreResult> {
    if (!parseSnapshotFilename(id)) {
      throw new Error('Restore requires a valid automatic backup snapshot ID.')
    }
    const scope = resolveScope(deps)
    const uri = `${scope.dir}${id}`
    const assertScope = () => assertScopeUnchanged(deps, scope)
    const target = deps.createRestoreTarget(scope.targetScope)
    const result = await deps.mergeRestoreFromBackupUri(uri, {
      name: id,
      mimeType: 'application/zip',
      assertScope,
      target,
    })
    assertScope()
    return result
  }

  async function exportLatestAutoBackup(): Promise<AutoBackupSnapshot | null> {
    const scope = resolveScope(deps)
    const snapshots = await listSnapshots(deps, scope)
    const latest = snapshots[0] ?? null
    if (!latest || deps.platform === 'web') return latest
    if (!deps.shareBackup) {
      throw new Error('Sharing is unavailable on this device.')
    }
    assertScopeUnchanged(deps, scope)
    await deps.shareBackup(latest.uri)
    return latest
  }

  return {
    getAutoBackupStatus,
    runAutoBackupIfDue,
    listAutoBackups,
    getLatestAutoBackup,
    restoreAutoBackup,
    exportLatestAutoBackup,
  }
}
