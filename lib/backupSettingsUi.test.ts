import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AutoBackupSnapshot } from './autoBackupService'
import type { ImportResult } from './backupArchive'
import {
  buildRestoreConfirmMessage,
  canExportLatestAutoBackup,
  canRestoreAutoBackup,
  deriveLastSavedStatus,
  formatImportResultMessage,
  formatSnapshotCounts,
  formatSnapshotDateTime,
  formatSnapshotLabel,
  isBackupActionActive,
  isBackupBusy,
} from './backupSettingsUi'

const snapshot = (overrides: Partial<AutoBackupSnapshot> = {}): AutoBackupSnapshot => {
  const timestampMs = overrides.timestampMs ?? new Date(2026, 6, 19, 14, 30).getTime()
  return {
    id: 'trove-auto-backup-2026-07-19-1750000000000.zip',
    uri: 'file:///doc/backups/local/trove-auto-backup-2026-07-19-1750000000000.zip',
    dayKey: '2026-07-19',
    timestampMs,
    timestamp: new Date(timestampMs).toISOString(),
    date: '2026-07-19',
    ...overrides,
  }
}

describe('formatSnapshotDateTime', () => {
  it('formats a readable date and time', () => {
    const timestampMs = new Date(2026, 6, 19, 14, 30).getTime()
    const text = formatSnapshotDateTime(timestampMs, 'en-US')
    assert.match(text, /Jul 19, 2026/)
    assert.match(text, /2:30 PM/)
  })
})

describe('formatSnapshotCounts', () => {
  it('returns null when counts are missing', () => {
    assert.equal(formatSnapshotCounts(snapshot({ saves: undefined, collections: undefined })), null)
  })

  it('formats save and collection counts', () => {
    assert.equal(formatSnapshotCounts(snapshot({ saves: 3, collections: 2 })), '3 saves · 2 collections')
  })

  it('uses singular labels', () => {
    assert.equal(formatSnapshotCounts(snapshot({ saves: 1, collections: 1 })), '1 save · 1 collection')
  })
})

describe('formatSnapshotLabel', () => {
  it('combines date/time with counts when present', () => {
    const label = formatSnapshotLabel(snapshot({ saves: 4, collections: 1 }), 'en-US')
    assert.match(label, /Jul 19, 2026/)
    assert.match(label, /4 saves · 1 collection/)
  })
})

describe('deriveLastSavedStatus', () => {
  it('reports unavailable on web', () => {
    assert.equal(
      deriveLastSavedStatus({
        available: false,
        enabled: true,
        lastSavedAt: null,
        lastSavedDayKey: null,
        snapshotCount: 0,
      }),
      'Automatic local backup is unavailable on web.',
    )
  })

  it('reports when no snapshots exist yet', () => {
    assert.equal(
      deriveLastSavedStatus({
        available: true,
        enabled: true,
        lastSavedAt: null,
        lastSavedDayKey: null,
        snapshotCount: 0,
      }),
      'No automatic backup saved yet.',
    )
  })

  it('reports the latest saved date when snapshots exist', () => {
    const status = deriveLastSavedStatus({
      available: true,
      enabled: true,
      lastSavedAt: new Date(Date.UTC(2026, 6, 19, 9, 0)).toISOString(),
      lastSavedDayKey: '2026-07-19',
      snapshotCount: 2,
    })
    assert.match(status, /Last saved/)
    assert.match(status, /Jul 19, 2026/)
  })

  it('reports disabled while retaining the latest saved date', () => {
    const status = deriveLastSavedStatus({
      available: true,
      enabled: false,
      lastSavedAt: new Date(2026, 6, 19, 9, 0).toISOString(),
      lastSavedDayKey: '2026-07-19',
      snapshotCount: 2,
    })
    assert.match(status, /Automatic backup is off/)
    assert.match(status, /Last saved/)
    assert.match(status, /Jul 19, 2026/)
  })
})

describe('canRestoreAutoBackup / canExportLatestAutoBackup', () => {
  it('disables actions when unavailable, busy, or empty', () => {
    assert.equal(canRestoreAutoBackup({ available: false, busy: false, snapshotCount: 3 }), false)
    assert.equal(canRestoreAutoBackup({ available: true, busy: true, snapshotCount: 3 }), false)
    assert.equal(canRestoreAutoBackup({ available: true, busy: false, snapshotCount: 0 }), false)
    assert.equal(canRestoreAutoBackup({ available: true, busy: false, snapshotCount: 1 }), true)
    assert.equal(canExportLatestAutoBackup({ available: true, busy: false, snapshotCount: 1 }), true)
  })
})

describe('backup busy state', () => {
  it('spins only the active action while treating any action as busy', () => {
    assert.equal(isBackupBusy('restore'), true)
    assert.equal(isBackupBusy(null), false)
    assert.equal(isBackupActionActive('restore', 'restore'), true)
    assert.equal(isBackupActionActive('restore', 'exportLatest'), false)
  })
})

describe('buildRestoreConfirmMessage', () => {
  it('states merge behavior explicitly', () => {
    const message = buildRestoreConfirmMessage(snapshot(), 'en-US')
    assert.match(message, /merge/i)
    assert.match(message, /never delete/i)
    assert.match(message, /Jul 19, 2026/)
  })
})

describe('formatImportResultMessage', () => {
  it('formats trove import summary', () => {
    const message = formatImportResultMessage({
      saves: 2,
      collections: 1,
      thumbnailsRepaired: 0,
      source: 'trove',
    })
    assert.match(message, /Added 2 saves and 1 collection/)
  })

  it('uses singular labels for trove imports', () => {
    const message = formatImportResultMessage({
      saves: 1,
      collections: 1,
      thumbnailsRepaired: 0,
      source: 'trove',
    })
    assert.match(message, /Added 1 save and 1 collection/)
    assert.doesNotMatch(message, /1 saves/)
  })

  it('includes limit and skipped details', () => {
    const message = formatImportResultMessage({
      saves: 1,
      collections: 0,
      thumbnailsRepaired: 2,
      skipped: 1,
      limited: 3,
      source: 'trove',
    })
    assert.match(message, /Skipped 1 duplicate/)
    assert.match(message, /3 items not imported/)
    assert.match(message, /Refetched 2 link previews/)
  })

  it('formats raindrop import summary', () => {
    const message = formatImportResultMessage({
      saves: 5,
      collections: 2,
      thumbnailsRepaired: 0,
      source: 'raindrop',
    } satisfies ImportResult)
    assert.match(message, /Imported 5 saves from Raindrop/)
  })
})
