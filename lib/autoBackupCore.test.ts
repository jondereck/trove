import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AUTO_BACKUP_RETENTION,
  buildSnapshotFilename,
  chooseSnapshotsToPrune,
  deriveLastSavedDayKey,
  isAutoBackupDue,
  localCalendarDayKey,
  parseSnapshotFilename,
  resolveAutoBackupScope,
  scopeNamespace,
  sortSnapshots,
} from './autoBackupCore'

describe('localCalendarDayKey', () => {
  it('uses local calendar date, not UTC midnight rollover', () => {
    const lateLocal = new Date(2026, 6, 19, 23, 30, 0)
    assert.equal(localCalendarDayKey(lateLocal), '2026-07-19')
  })

  it('formats single-digit months and days', () => {
    assert.equal(localCalendarDayKey(new Date(2026, 0, 5, 12, 0, 0)), '2026-01-05')
  })
})

describe('resolveAutoBackupScope', () => {
  it('uses cloud scope only when signed in with cloud entitlement', () => {
    assert.deepEqual(
      resolveAutoBackupScope(true, true, 'user-abc'),
      { kind: 'cloud', userId: 'user-abc' },
    )
    assert.deepEqual(resolveAutoBackupScope(true, false, 'user-abc'), { kind: 'local' })
    assert.deepEqual(resolveAutoBackupScope(false, true, null), { kind: 'local' })
    assert.deepEqual(resolveAutoBackupScope(true, true, null), { kind: 'local' })
  })
})

describe('scopeNamespace', () => {
  it('isolates local and cloud users', () => {
    assert.equal(scopeNamespace({ kind: 'local' }), 'local')
    const cloud = scopeNamespace({
      kind: 'cloud',
      userId: '550e8400-e29b-41d4-a716-446655440000',
    })
    assert.match(cloud, /^cloud-[a-f0-9]+$/)
    assert.notEqual(cloud, 'local')
  })

  it('encodes unsafe characters without losing identity', () => {
    const encoded = scopeNamespace({ kind: 'cloud', userId: '../evil' })
    assert.match(encoded, /^cloud-[a-zA-Z0-9-]+$/)
    assert.notEqual(
      scopeNamespace({ kind: 'cloud', userId: 'user/../x' }),
      scopeNamespace({ kind: 'cloud', userId: 'userx' }),
    )
  })
})

describe('snapshot filename helpers', () => {
  it('round-trips auto-backup snapshot names', () => {
    const name = buildSnapshotFilename('2026-07-19', 1734567890123)
    assert.equal(name, 'trove-auto-backup-2026-07-19-1734567890123.zip')
    assert.deepEqual(parseSnapshotFilename(name), {
      id: name,
      dayKey: '2026-07-19',
      timestampMs: 1734567890123,
    })
  })

  it('ignores unrelated files', () => {
    assert.equal(parseSnapshotFilename('trove-backup-123.zip'), null)
    assert.equal(parseSnapshotFilename('notes.txt'), null)
  })

  it('rejects impossible calendar dates and unsafe timestamps', () => {
    assert.equal(parseSnapshotFilename('trove-auto-backup-2026-02-29-100.zip'), null)
    assert.equal(parseSnapshotFilename('trove-auto-backup-2026-13-01-100.zip'), null)
    assert.equal(
      parseSnapshotFilename('trove-auto-backup-2026-07-19-999999999999999999999.zip'),
      null,
    )
    assert.equal(
      parseSnapshotFilename('trove-auto-backup-2026-07-19-8640000000000001.zip'),
      null,
    )
    assert.ok(parseSnapshotFilename('trove-auto-backup-2024-02-29-100.zip'))
    assert.ok(parseSnapshotFilename('trove-auto-backup-2024-02-29-8640000000000000.zip'))
  })
})

describe('sortSnapshots', () => {
  it('orders newest timestamp first', () => {
    const sorted = sortSnapshots([
      { id: 'a', timestampMs: 100 },
      { id: 'b', timestampMs: 300 },
      { id: 'c', timestampMs: 200 },
    ])
    assert.deepEqual(sorted.map(s => s.id), ['b', 'c', 'a'])
  })
})

describe('deriveLastSavedDayKey', () => {
  it('reads day key from newest snapshot filename', () => {
    const key = deriveLastSavedDayKey([
      'trove-auto-backup-2026-07-17-100.zip',
      'trove-auto-backup-2026-07-19-300.zip',
      'trove-auto-backup-2026-07-18-200.zip',
      'readme.txt',
    ])
    assert.equal(key, '2026-07-19')
  })

  it('returns null when no valid snapshots exist', () => {
    assert.equal(deriveLastSavedDayKey(['readme.txt']), null)
    assert.equal(deriveLastSavedDayKey([]), null)
  })
})

describe('isAutoBackupDue', () => {
  const today = new Date(2026, 6, 19, 9, 0, 0)

  it('is due with no prior snapshot day', () => {
    assert.equal(isAutoBackupDue(null, today), true)
    assert.equal(isAutoBackupDue(undefined, today), true)
  })

  it('is not due when last snapshot matches today', () => {
    assert.equal(isAutoBackupDue('2026-07-19', today), false)
  })

  it('is due when last snapshot is an earlier calendar day', () => {
    assert.equal(isAutoBackupDue('2026-07-18', today), true)
  })
})

describe('chooseSnapshotsToPrune', () => {
  const files = Array.from({ length: 9 }, (_, i) =>
    buildSnapshotFilename('2026-07-10', 1000 + i),
  )

  it(`keeps newest ${AUTO_BACKUP_RETENTION} snapshots`, () => {
    const { keep, prune } = chooseSnapshotsToPrune(files)
    assert.equal(keep.length, AUTO_BACKUP_RETENTION)
    assert.equal(prune.length, 2)
    assert.equal(keep[0], buildSnapshotFilename('2026-07-10', 1008))
    assert.deepEqual(
      prune.sort(),
      [
        buildSnapshotFilename('2026-07-10', 1000),
        buildSnapshotFilename('2026-07-10', 1001),
      ].sort(),
    )
  })

  it('ignores non-snapshot files when pruning', () => {
    const mixed = [...files, 'notes.txt', 'trove-backup-manual.zip']
    const { keep, prune } = chooseSnapshotsToPrune(mixed)
    assert.equal(keep.length, AUTO_BACKUP_RETENTION)
    assert.equal(prune.length, 2)
    assert.equal(keep.includes('notes.txt'), false)
  })
})
