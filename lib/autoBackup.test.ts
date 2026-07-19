import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSnapshotFilename,
  localCalendarDayKey,
  scopeNamespace,
} from './autoBackupCore'
import {
  createAutoBackupService,
  type AutoBackupDeps,
} from './autoBackupService'
import type { Settings } from './settings'

const DOC = 'file:///doc/'
const CACHE = 'file:///cache/'
const SCOPE_DIR = `${DOC}backups/local/`

type FileEntry = { size: number; content?: string }

function pathKey(uri: string): string {
  return uri.replace(/^file:\/\//, '')
}

function isolatedLock() {
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

function defaultSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    autoOrganize: true,
    aiSuggestTitleDescription: true,
    aiSuggestTags: true,
    aiSuggestCollections: true,
    libraryView: 'grid',
    shareReviewModal: false,
    clipboardAutoPaste: true,
    appearance: 'system',
    digestEnabled: false,
    digestCadence: 'weekly',
    digestHour: 10,
    digestWeekday: 0,
    autoBackupEnabled: true,
    ...overrides,
  }
}

function baseDeps(overrides: Partial<AutoBackupDeps> = {}): AutoBackupDeps {
  const files = new Map<string, FileEntry>()
  const now = new Date(2026, 6, 19, 10, 0, 0)
  let cacheSequence = 0

  const deps: AutoBackupDeps = {
    platform: 'android',
    getSettings: async () => defaultSettings(),
    isLoggedIn: () => false,
    hasCloud: () => false,
    getUserId: () => null,
    documentDirectory: DOC,
    cacheDirectory: CACHE,
    createBackupArchive: async (uri) => {
      files.set(pathKey(uri), { size: 128 })
      return { saves: 2, collections: 1 }
    },
    mergeRestoreFromBackupUri: async () => ({
      saves: 1,
      collections: 0,
      thumbnailsRepaired: 0,
      source: 'trove' as const,
    }),
    createRestoreTarget: () => ({
      importCap: Infinity,
      fetchCollections: async () => [],
      createCollection: async () => null,
      createSave: async () => null,
      importMedia: async () => undefined,
      repairMissingThumbnails: async () => 0,
      isLimitError: () => false,
    }),
    validateBackupArchive: async () => {},
    makeDirectoryAsync: async () => {},
    readDirectoryAsync: async (dir) => {
      const prefix = pathKey(dir).replace(/\/?$/, '/')
      return [...files.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length))
        .filter(Boolean)
    },
    readAsStringAsync: async (uri) => {
      const entry = files.get(pathKey(uri))
      if (!entry?.content) throw new Error('missing text file')
      return entry.content
    },
    writeAsStringAsync: async (uri, content) => {
      files.set(pathKey(uri), { size: content.length, content })
    },
    getInfoAsync: async (uri) => {
      const entry = files.get(pathKey(uri))
      return entry ? { exists: true, size: entry.size } : { exists: false }
    },
    copyAsync: async ({ from, to }) => {
      const entry = files.get(pathKey(from))
      if (!entry) throw new Error('missing source')
      files.set(pathKey(to), { ...entry })
    },
    moveAsync: async ({ from, to }) => {
      const entry = files.get(pathKey(from))
      if (!entry) throw new Error('missing source')
      files.set(pathKey(to), { ...entry })
      files.delete(pathKey(from))
    },
    deleteAsync: async (uri) => {
      files.delete(pathKey(uri))
    },
    now: () => now,
    lock: isolatedLock(),
    createCacheId: () => `test-${++cacheSequence}`,
    shareBackup: async () => {},
    ...overrides,
  }

  return deps
}

describe('createAutoBackupService', () => {
  it('returns web-safe disabled status without touching filesystem', async () => {
    const readCalls: string[] = []
    const svc = createAutoBackupService(baseDeps({
      platform: 'web',
      readDirectoryAsync: async (dir) => {
        readCalls.push(dir)
        return []
      },
    }))

    const status = await svc.getAutoBackupStatus()
    assert.equal(status.available, false)
    assert.equal(status.enabled, false)
    assert.equal(status.snapshots.length, 0)

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.ran, false)
    assert.equal(result.skipped, 'web')
    assert.equal(readCalls.length, 0)
  })

  it('skips when auto backup is disabled', async () => {
    let created = false
    const svc = createAutoBackupService(baseDeps({
      getSettings: async () => defaultSettings({ autoBackupEnabled: false }),
      createBackupArchive: async () => {
        created = true
        return { saves: 0, collections: 0 }
      },
    }))

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.ran, false)
    assert.equal(result.skipped, 'disabled')
    assert.equal(created, false)
  })

  it('skips when already backed up today', async () => {
    const dayKey = localCalendarDayKey(new Date(2026, 6, 19, 10, 0, 0))
    const existing = buildSnapshotFilename(dayKey, 1000)
    let created = false

    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => [existing],
      getInfoAsync: async (uri) => {
        const name = pathKey(uri).split('/').pop()!
        if (name === existing) return { exists: true, size: 64 }
        return { exists: false }
      },
      createBackupArchive: async () => {
        created = true
        return { saves: 0, collections: 0 }
      },
    }))

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.ran, false)
    assert.equal(result.skipped, 'not_due')
    assert.equal(created, false)
  })

  it('creates, validates, moves, and prunes on success', async () => {
    const dayKey = '2026-07-18'
    const stale = Array.from({ length: 7 }, (_, i) =>
      buildSnapshotFilename(dayKey, 100 + i),
    )
    const files = new Map<string, FileEntry>()
    stale.forEach(name => files.set(pathKey(`${SCOPE_DIR}${name}`), { size: 50 }))

    const deleted: string[] = []
    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async (dir) => {
        const prefix = pathKey(dir).replace(/\/?$/, '/')
        return [...files.keys()]
          .filter(key => key.startsWith(prefix))
          .map(key => key.slice(prefix.length))
      },
      getInfoAsync: async (uri) => {
        const entry = files.get(pathKey(uri))
        return entry ? { exists: true, size: entry.size } : { exists: false }
      },
      moveAsync: async ({ from, to }) => {
        const entry = files.get(pathKey(from)) ?? { size: 128 }
        files.set(pathKey(to), entry)
        files.delete(pathKey(from))
      },
      readAsStringAsync: async (uri) => {
        const entry = files.get(pathKey(uri))
        if (!entry?.content) throw new Error('missing metadata')
        return entry.content
      },
      writeAsStringAsync: async (uri, content) => {
        files.set(pathKey(uri), { size: content.length, content })
      },
      deleteAsync: async (uri) => {
        deleted.push(uri)
        files.delete(pathKey(uri))
      },
      createBackupArchive: async (uri) => {
        files.set(pathKey(uri), { size: 200 })
        return { saves: 4, collections: 2 }
      },
    }))

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.ran, true)
    assert.equal(result.success, true)
    assert.ok(result.snapshot)
    assert.equal(result.snapshot!.saves, 4)
    assert.equal(result.snapshot!.collections, 2)

    const status = await svc.getAutoBackupStatus()
    assert.equal(status.snapshotCount, 7)
    assert.equal(status.due, false)
    assert.equal(status.snapshots[0].saves, 4)
    assert.equal(status.snapshots[0].collections, 2)
    assert.equal(
      deleted.filter(uri => uri.includes('backups/local') && uri.endsWith('.zip')).length,
      1,
    )
    assert.equal(deleted.filter(uri => uri.endsWith('.metadata.json')).length, 1)
  })

  it('lists old snapshots without counts and ignores malformed sidecars', async () => {
    const old = buildSnapshotFilename('2026-07-17', 100)
    const malformed = buildSnapshotFilename('2026-07-18', 200)
    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => [
        old,
        malformed,
        `${malformed}.metadata.json`,
        'orphan.zip.metadata.json',
      ],
      readAsStringAsync: async (uri) => {
        if (uri.endsWith(`${malformed}.metadata.json`)) {
          return JSON.stringify({
            id: 'different.zip',
            exportedAt: 'not-a-date',
            saves: -1,
            collections: 2,
          })
        }
        throw new Error('missing metadata')
      },
    }))

    const snapshots = await svc.listAutoBackups()
    assert.equal(snapshots.length, 2)
    assert.equal(snapshots[0].id, malformed)
    assert.equal(snapshots[0].saves, undefined)
    assert.equal(snapshots[1].id, old)
    assert.equal(snapshots[1].collections, undefined)
  })

  it('keeps a successful zip when sidecar metadata writing fails', async () => {
    let durableZipExists = false
    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => durableZipExists
        ? [buildSnapshotFilename('2026-07-19', new Date(2026, 6, 19, 10).getTime())]
        : [],
      getInfoAsync: async () => ({ exists: true, size: 128 }),
      moveAsync: async () => {
        durableZipExists = true
      },
      writeAsStringAsync: async () => {
        throw new Error('metadata disk full')
      },
    }))

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.success, true)
    assert.equal(durableZipExists, true)
    const snapshots = await svc.listAutoBackups()
    assert.equal(snapshots.length, 1)
    assert.equal(snapshots[0].saves, undefined)
  })

  it('does not prune when backup creation fails', async () => {
    const dayKey = '2026-07-18'
    const stale = Array.from({ length: 7 }, (_, i) =>
      buildSnapshotFilename(dayKey, 200 + i),
    )
    const deleted: string[] = []

    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => stale,
      createBackupArchive: async () => {
        throw new Error('zip failed')
      },
      deleteAsync: async (uri) => {
        deleted.push(uri)
      },
    }))

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.ran, true)
    assert.equal(result.success, false)
    assert.match(result.error ?? '', /zip failed/)
    assert.equal(deleted.filter(uri => uri.includes('backups/local')).length, 0)
  })

  it('does not prune when validation fails', async () => {
    const dayKey = '2026-07-18'
    const stale = [buildSnapshotFilename(dayKey, 500)]
    const deleted: string[] = []

    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => stale,
      validateBackupArchive: async () => {
        throw new Error('backup.json is malformed')
      },
      deleteAsync: async (uri) => {
        deleted.push(uri)
      },
    }))

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.success, false)
    assert.match(result.error ?? '', /malformed/i)
    assert.equal(deleted.filter(uri => uri.includes('backups/local')).length, 0)
    assert.equal((await svc.getAutoBackupStatus()).due, true)
  })

  it('leaves sidecar intact when zip deletion fails during retention prune', async () => {
    const dayKey = '2026-07-18'
    const stale = Array.from({ length: 7 }, (_, i) =>
      buildSnapshotFilename(dayKey, 100 + i),
    )
    const files = new Map<string, FileEntry>()
    stale.forEach(name => {
      files.set(pathKey(`${SCOPE_DIR}${name}`), { size: 50 })
      files.set(pathKey(`${SCOPE_DIR}${name}.metadata.json`), {
        size: 32,
        content: JSON.stringify({
          id: name,
          exportedAt: new Date(100).toISOString(),
          saves: 1,
          collections: 0,
        }),
      })
    })

    const deleted: string[] = []
    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async (dir) => {
        const prefix = pathKey(dir).replace(/\/?$/, '/')
        return [...files.keys()]
          .filter(key => key.startsWith(prefix))
          .map(key => key.slice(prefix.length))
      },
      getInfoAsync: async (uri) => {
        const entry = files.get(pathKey(uri))
        return entry ? { exists: true, size: entry.size } : { exists: false }
      },
      moveAsync: async ({ from, to }) => {
        const entry = files.get(pathKey(from)) ?? { size: 128 }
        files.set(pathKey(to), entry)
        files.delete(pathKey(from))
      },
      readAsStringAsync: async (uri) => {
        const entry = files.get(pathKey(uri))
        if (!entry?.content) throw new Error('missing metadata')
        return entry.content
      },
      writeAsStringAsync: async (uri, content) => {
        files.set(pathKey(uri), { size: content.length, content })
      },
      deleteAsync: async (uri) => {
        const key = pathKey(uri)
        if (key.endsWith('.zip')) {
          throw new Error('zip delete failed')
        }
        deleted.push(uri)
        files.delete(key)
      },
      createBackupArchive: async (uri) => {
        files.set(pathKey(uri), { size: 200 })
        return { saves: 4, collections: 2 }
      },
    }))

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.success, true)

    const prunedZip = stale[0]
    assert.ok(files.has(pathKey(`${SCOPE_DIR}${prunedZip}`)))
    assert.ok(files.has(pathKey(`${SCOPE_DIR}${prunedZip}.metadata.json`)))
    assert.equal(deleted.filter(uri => uri.endsWith('.metadata.json')).length, 0)
  })

  it('ignores sidecars with unsafe or excessive counts', async () => {
    const name = buildSnapshotFilename('2026-07-19', 500)
    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => [name, `${name}.metadata.json`],
      readAsStringAsync: async (uri) => {
        if (uri.endsWith(`${name}.metadata.json`)) {
          return JSON.stringify({
            id: name,
            exportedAt: new Date(500).toISOString(),
            saves: Number.MAX_SAFE_INTEGER + 1,
            collections: 2_000_000,
          })
        }
        throw new Error('missing metadata')
      },
    }))

    const snapshots = await svc.listAutoBackups()
    assert.equal(snapshots.length, 1)
    assert.equal(snapshots[0].saves, undefined)
    assert.equal(snapshots[0].collections, undefined)
  })

  it('releases the mutex when scope directory setup fails', async () => {
    let makeDirectoryCalls = 0
    const svc = createAutoBackupService(baseDeps({
      makeDirectoryAsync: async () => {
        makeDirectoryCalls++
        if (makeDirectoryCalls === 1) throw new Error('directory unavailable')
      },
    }))

    const first = await svc.runAutoBackupIfDue()
    assert.equal(first.success, false)
    assert.match(first.error ?? '', /directory unavailable/)

    const second = await svc.runAutoBackupIfDue()
    assert.equal(second.success, true)
    assert.notEqual(second.skipped, 'in_progress')
  })

  it('surfaces inventory read failures without building or pruning', async () => {
    let created = false
    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => {
        throw new Error('disk denied')
      },
      createBackupArchive: async () => {
        created = true
        return { saves: 0, collections: 0 }
      },
    }))

    await assert.rejects(svc.getAutoBackupStatus(), /Unable to read automatic backups.*disk denied/)
    await assert.rejects(svc.listAutoBackups(), /Unable to read automatic backups.*disk denied/)

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.ran, false)
    assert.equal(result.success, false)
    assert.match(result.error ?? '', /Unable to read automatic backups.*disk denied/)
    assert.equal(created, false)
  })

  it('keeps a run in its captured scope and aborts if the account switches', async () => {
    let userId = 'user-a'
    let userReads = 0
    let moved = false
    const readDirs: string[] = []
    const deleted: string[] = []
    const scopeA = scopeNamespace({ kind: 'cloud', userId: 'user-a' })

    const svc = createAutoBackupService(baseDeps({
      isLoggedIn: () => true,
      hasCloud: () => true,
      getUserId: () => {
        userReads++
        return userId
      },
      readDirectoryAsync: async (dir) => {
        readDirs.push(dir)
        return [buildSnapshotFilename('2026-07-18', 100)]
      },
      createBackupArchive: async () => {
        userId = 'user-b'
        return { saves: 1, collections: 0 }
      },
      getInfoAsync: async () => ({ exists: true, size: 128 }),
      moveAsync: async () => {
        moved = true
      },
      deleteAsync: async (uri) => {
        deleted.push(uri)
      },
    }))

    const result = await svc.runAutoBackupIfDue()
    assert.equal(result.success, false)
    assert.match(result.error ?? '', /data scope changed/i)
    assert.equal(userReads, 2)
    assert.deepEqual(readDirs, [`${DOC}backups/${scopeA}/`])
    assert.equal(moved, false)
    assert.equal(deleted.some(uri => uri.includes('/backups/')), false)
  })

  it('resolves scope once for each list and status operation', async () => {
    let userReads = 0
    const readDirs: string[] = []
    const scope = scopeNamespace({ kind: 'cloud', userId: 'user-a' })
    const svc = createAutoBackupService(baseDeps({
      isLoggedIn: () => true,
      hasCloud: () => true,
      getUserId: () => {
        userReads++
        return userReads % 2 ? 'user-a' : 'user-b'
      },
      readDirectoryAsync: async (dir) => {
        readDirs.push(dir)
        return []
      },
    }))

    await svc.listAutoBackups()
    assert.equal(userReads, 1)
    assert.deepEqual(readDirs, [`${DOC}backups/${scope}/`])

    userReads = 0
    readDirs.length = 0
    const status = await svc.getAutoBackupStatus()
    assert.equal(userReads, 1)
    assert.equal(status.scope, scope)
    assert.deepEqual(readDirs, [`${DOC}backups/${scope}/`])
  })

  it('dedupes concurrent runAutoBackupIfDue calls', async () => {
    let inFlight = 0
    let maxConcurrent = 0

    const svc = createAutoBackupService(baseDeps({
      createBackupArchive: async (uri) => {
        inFlight++
        maxConcurrent = Math.max(maxConcurrent, inFlight)
        await new Promise(r => setTimeout(r, 20))
        inFlight--
        return { saves: 1, collections: 0 }
      },
    }))

    const [a, b] = await Promise.all([
      svc.runAutoBackupIfDue(),
      svc.runAutoBackupIfDue(),
    ])

    const outcomes = [a, b]
    const ranCount = outcomes.filter(r => r.ran).length
    const skippedCount = outcomes.filter(r => r.skipped === 'in_progress').length
    assert.equal(ranCount, 1)
    assert.equal(skippedCount, 1)
    assert.equal(maxConcurrent, 1)
  })

  it('dedupes concurrent runs across service instances', async () => {
    let releaseCreate!: () => void
    const createBlocked = new Promise<void>(resolve => {
      releaseCreate = resolve
    })
    let started!: () => void
    const createStarted = new Promise<void>(resolve => {
      started = resolve
    })
    let secondCreated = false

    const first = createAutoBackupService(baseDeps({
      lock: undefined,
      createBackupArchive: async () => {
        started()
        await createBlocked
        return { saves: 1, collections: 0 }
      },
      getInfoAsync: async () => ({ exists: true, size: 128 }),
      moveAsync: async () => {},
    }))
    const second = createAutoBackupService(baseDeps({
      lock: undefined,
      createBackupArchive: async () => {
        secondCreated = true
        return { saves: 1, collections: 0 }
      },
    }))

    const firstRun = first.runAutoBackupIfDue()
    await createStarted
    const secondResult = await second.runAutoBackupIfDue()
    releaseCreate()
    await firstRun

    assert.equal(secondResult.skipped, 'in_progress')
    assert.equal(secondCreated, false)
  })

  it('uses unique cache filenames when timestamps repeat', async () => {
    const cacheUris: string[] = []
    const svc = createAutoBackupService(baseDeps({
      createCacheId: (() => {
        let id = 0
        return () => `unique-${++id}`
      })(),
      createBackupArchive: async (uri) => {
        cacheUris.push(uri)
        throw new Error('retryable')
      },
    }))

    await svc.runAutoBackupIfDue()
    await svc.runAutoBackupIfDue()
    assert.equal(cacheUris.length, 2)
    assert.notEqual(cacheUris[0], cacheUris[1])
  })

  it('restoreAutoBackup resolves a valid snapshot ID inside the current scope', async () => {
    let restoredUri = ''
    const id = buildSnapshotFilename('2026-07-18', 200)
    const svc = createAutoBackupService(baseDeps({
      mergeRestoreFromBackupUri: async (uri) => {
        restoredUri = uri
        return { saves: 3, collections: 1, thumbnailsRepaired: 0, source: 'trove' }
      },
    }))

    const result = await svc.restoreAutoBackup(id)
    assert.equal(restoredUri, `${SCOPE_DIR}${id}`)
    assert.equal(result.saves, 3)
  })

  it('passes a restore guard that aborts when the account changes mid-merge', async () => {
    let userId = 'user-a'
    const id = buildSnapshotFilename('2026-07-18', 201)
    const svc = createAutoBackupService(baseDeps({
      isLoggedIn: () => true,
      hasCloud: () => true,
      getUserId: () => userId,
      mergeRestoreFromBackupUri: async (_uri, options) => {
        assert.ok(options?.assertScope)
        await options.assertScope()
        userId = 'user-b'
        await options.assertScope()
        return { saves: 1, collections: 0, thumbnailsRepaired: 0 }
      },
    }))

    await assert.rejects(svc.restoreAutoBackup(id), /data scope changed/i)
  })

  it('rechecks scope after restore even if the merge adapter omits its guard', async () => {
    let userId = 'user-a'
    const id = buildSnapshotFilename('2026-07-18', 202)
    const svc = createAutoBackupService(baseDeps({
      isLoggedIn: () => true,
      hasCloud: () => true,
      getUserId: () => userId,
      mergeRestoreFromBackupUri: async () => {
        userId = 'user-b'
        return { saves: 1, collections: 0, thumbnailsRepaired: 0 }
      },
    }))

    await assert.rejects(svc.restoreAutoBackup(id), /data scope changed/i)
  })

  it('creates one captured restore target and passes it through merge', async () => {
    let userId = 'user-a'
    let targetFactoryCalls = 0
    const capturedTarget = {
      importCap: Infinity,
      fetchCollections: async () => [],
      createCollection: async () => null,
      createSave: async () => null,
      importMedia: async () => undefined,
      repairMissingThumbnails: async () => 0,
      isLimitError: () => false,
    }
    const id = buildSnapshotFilename('2026-07-18', 204)
    const svc = createAutoBackupService(baseDeps({
      isLoggedIn: () => true,
      hasCloud: () => true,
      getUserId: () => userId,
      createRestoreTarget: (scope) => {
        targetFactoryCalls++
        assert.deepEqual(scope, { kind: 'cloud', userId: 'user-a' })
        return capturedTarget
      },
      mergeRestoreFromBackupUri: async (_uri, options) => {
        assert.equal(options?.target, capturedTarget)
        userId = 'user-b'
        return { saves: 0, collections: 0, thumbnailsRepaired: 0 }
      },
    }))

    await assert.rejects(svc.restoreAutoBackup(id), /data scope changed/i)
    assert.equal(targetFactoryCalls, 1)
  })

  it('rejects traversal, external URIs, and invalid snapshot IDs', async () => {
    let restoreCalls = 0
    const valid = buildSnapshotFilename('2026-07-18', 200)
    const svc = createAutoBackupService(baseDeps({
      mergeRestoreFromBackupUri: async () => {
        restoreCalls++
        throw new Error('should not restore')
      },
    }))

    for (const id of [`../${valid}`, `${SCOPE_DIR}${valid}`, 'trove-backup-200.zip']) {
      await assert.rejects(svc.restoreAutoBackup(id), /valid automatic backup snapshot ID/)
    }
    assert.equal(restoreCalls, 0)
  })

  it('getLatestAutoBackup returns newest snapshot metadata', async () => {
    const older = buildSnapshotFilename('2026-07-17', 100)
    const newer = buildSnapshotFilename('2026-07-18', 200)
    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => [older, newer, 'junk.txt'],
      getInfoAsync: async () => ({ exists: true, size: 99 }),
    }))

    const latest = await svc.getLatestAutoBackup()
    assert.ok(latest)
    assert.equal(latest!.id, newer)
    assert.equal(latest!.timestampMs, 200)
  })

  it('throws when export sharing is unavailable', async () => {
    const latest = buildSnapshotFilename('2026-07-18', 200)
    const svc = createAutoBackupService(baseDeps({
      readDirectoryAsync: async () => [latest],
      shareBackup: undefined,
    }))

    await assert.rejects(svc.exportLatestAutoBackup(), /Sharing is unavailable/)
  })

  it('does not share latest backup after the active scope changes', async () => {
    let userId = 'user-a'
    let shared = false
    const latest = buildSnapshotFilename('2026-07-18', 203)
    const svc = createAutoBackupService(baseDeps({
      isLoggedIn: () => true,
      hasCloud: () => true,
      getUserId: () => userId,
      readDirectoryAsync: async () => {
        userId = 'user-b'
        return [latest]
      },
      shareBackup: async () => {
        shared = true
      },
    }))

    await assert.rejects(svc.exportLatestAutoBackup(), /data scope changed/i)
    assert.equal(shared, false)
  })
})
