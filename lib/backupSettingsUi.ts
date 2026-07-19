import type { AutoBackupSnapshot } from './autoBackupService'
import type { ImportResult } from './backupArchive'

export type LastSavedStatusInput = {
  available: boolean
  enabled: boolean
  lastSavedAt: string | null
  lastSavedDayKey: string | null
  snapshotCount: number
}

export type AutoBackupActionInput = {
  available: boolean
  busy: boolean
  snapshotCount: number
}

export type BackupBusyAction =
  | 'toggle'
  | 'restore'
  | 'exportLatest'
  | 'manualExport'
  | 'manualImport'
  | null

export function isBackupBusy(action: BackupBusyAction): boolean {
  return action !== null
}

export function isBackupActionActive(
  action: BackupBusyAction,
  expected: Exclude<BackupBusyAction, null>,
): boolean {
  return action === expected
}

export function formatSnapshotDateTime(timestampMs: number, locale = 'en-US'): string {
  const date = new Date(timestampMs)
  const datePart = date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timePart = date.toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${datePart} at ${timePart}`
}

export function formatSnapshotCounts(snapshot: Pick<AutoBackupSnapshot, 'saves' | 'collections'>): string | null {
  if (snapshot.saves == null && snapshot.collections == null) return null
  const saves = snapshot.saves ?? 0
  const collections = snapshot.collections ?? 0
  const saveLabel = `${saves} save${saves === 1 ? '' : 's'}`
  const collectionLabel = `${collections} collection${collections === 1 ? '' : 's'}`
  return `${saveLabel} · ${collectionLabel}`
}

export function formatSnapshotLabel(snapshot: AutoBackupSnapshot, locale = 'en-US'): string {
  const when = formatSnapshotDateTime(snapshot.timestampMs, locale)
  const counts = formatSnapshotCounts(snapshot)
  return counts ? `${when} · ${counts}` : when
}

export function deriveLastSavedStatus(input: LastSavedStatusInput, locale = 'en-US'): string {
  if (!input.available) {
    return 'Automatic local backup is unavailable on web.'
  }
  if (!input.snapshotCount || !input.lastSavedAt) {
    return input.enabled
      ? 'No automatic backup saved yet.'
      : 'Automatic backup is off. No backup has been saved yet.'
  }
  const when = formatSnapshotDateTime(new Date(input.lastSavedAt).getTime(), locale)
  const lastSaved = `Last saved ${when}`
  return input.enabled ? lastSaved : `Automatic backup is off. ${lastSaved}.`
}

export function canRestoreAutoBackup(input: AutoBackupActionInput): boolean {
  return input.available && !input.busy && input.snapshotCount > 0
}

export function canExportLatestAutoBackup(input: AutoBackupActionInput): boolean {
  return input.available && !input.busy && input.snapshotCount > 0
}

export function buildRestoreConfirmMessage(snapshot: AutoBackupSnapshot, locale = 'en-US'): string {
  const when = formatSnapshotLabel(snapshot, locale)
  return (
    `Restore the automatic backup from ${when}? ` +
    'This merges items into your library and never deletes your current data.'
  )
}

export function formatImportResultMessage(res: ImportResult): string {
  const thumbs = res.thumbnailsRepaired
    ? ` Refetched ${res.thumbnailsRepaired} link preview${res.thumbnailsRepaired === 1 ? '' : 's'}.`
    : ''
  const skipped =
    res.skipped
      ? ` Skipped ${res.skipped} duplicate or empty row${res.skipped === 1 ? '' : 's'}.`
      : ''
  const limited =
    res.limited
      ? ` ${res.limited} item${res.limited === 1 ? '' : 's'} not imported — free plan limit.`
      : ''

  if (res.source === 'raindrop') {
    return (
      `Imported ${res.saves} save${res.saves === 1 ? '' : 's'} from Raindrop ` +
      `(${res.collections} collection${res.collections === 1 ? '' : 's'}).${skipped}${limited}${thumbs}`
    )
  }

  return `Added ${res.saves} save${res.saves === 1 ? '' : 's'} and ${res.collections} collection${res.collections === 1 ? '' : 's'}.${skipped}${limited}${thumbs}`
}
