import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
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
  mediaSentinel,
  mergeBackupRecordsWithTarget,
  normalizeBackupPayload,
  parseMediaSentinel,
  requireSafeMediaBasename,
  shouldBundleLocalMedia,
  toZipPath,
  validateBackupPayloadStructure,
} from './backupArchiveCore'

const LOCAL = 'file:///data/media/'

describe('buildUniqueCacheDirectory', () => {
  it('produces distinct paths for the same timestamp', () => {
    const first = buildUniqueCacheDirectory('file:///cache/', 'restore', 100, 'uuid-a')
    const second = buildUniqueCacheDirectory('file:///cache/', 'restore', 100, 'uuid-b')
    assert.equal(first, 'file:///cache/restore-100-uuid-a/')
    assert.equal(second, 'file:///cache/restore-100-uuid-b/')
    assert.notEqual(first, second)
  })
})

describe('guardedRestoreWrite', () => {
  it('checks scope before and after a write', async () => {
    let checks = 0
    let writes = 0
    const result = await guardedRestoreWrite(
      async () => { checks++ },
      async () => {
        writes++
        return 'created'
      },
    )

    assert.equal(result, 'created')
    assert.equal(checks, 2)
    assert.equal(writes, 1)
  })

  it('aborts before a write when the scope guard fails', async () => {
    let writes = 0
    await assert.rejects(
      guardedRestoreWrite(
        async () => { throw new Error('scope changed') },
        async () => {
          writes++
          return 'created'
        },
      ),
      /scope changed/,
    )
    assert.equal(writes, 0)
  })
})

describe('mergeBackupRecordsWithTarget', () => {
  it('uses only the captured target after the active target changes', async () => {
    const calls: string[] = []
    let activeTarget = 'target-a'
    const createdCollection = {
      id: 'created-collection',
      user_id: 'local',
      name: 'Recipes',
      icon: 'folder-outline',
      color: '#c0613c',
      created_at: '2026-07-19T00:00:00.000Z',
    }
    const createdSave = {
      id: 'created-save',
      user_id: 'local',
      title: 'Soup',
      type: 'image' as const,
      tags: ['food'],
      is_inbox: false,
      created_at: '2026-07-19T01:00:00.000Z',
    }

    const target = {
      importCap: Infinity,
      fetchCollections: async () => {
        calls.push('target-a:fetchCollections')
        activeTarget = 'target-b'
        return []
      },
      createCollection: async () => {
        calls.push('target-a:createCollection')
        return createdCollection
      },
      createSave: async (fields: { collection_id?: string; image_url?: string }) => {
        calls.push(`target-a:createSave:${fields.collection_id}:${fields.image_url}`)
        return createdSave
      },
      importMedia: async (_extractDir: string, name: string) => {
        calls.push(`target-a:importMedia:${name}`)
        return 'file:///bound/photo.jpg'
      },
      repairMissingThumbnails: async () => {
        calls.push('target-a:repairThumbnails')
        return 0
      },
      isLimitError: () => false,
    }

    const result = await mergeBackupRecordsWithTarget(
      {
        collections: [{
          id: 'source-collection',
          user_id: 'source',
          name: 'Recipes',
          icon: 'folder-outline',
          color: '#c0613c',
          created_at: '2026-07-18T00:00:00.000Z',
        }],
        saves: [{
          id: 'source-save',
          user_id: 'source',
          title: 'Soup',
          type: 'image',
          image_url: `${MEDIA_SCHEME}photo.jpg`,
          collection_id: 'source-collection',
          tags: ['food'],
          is_inbox: false,
          created_at: '2026-07-18T01:00:00.000Z',
        }],
      },
      'file:///extract/',
      target,
    )

    assert.equal(activeTarget, 'target-b')
    assert.deepEqual(calls, [
      'target-a:fetchCollections',
      'target-a:createCollection',
      'target-a:importMedia:photo.jpg',
      'target-a:createSave:created-collection:file:///bound/photo.jpg',
      'target-a:repairThumbnails',
    ])
    assert.equal(result.collections, 1)
    assert.equal(result.saves, 1)
  })
})

describe('toZipPath', () => {
  it('strips file:// prefix for zip APIs', () => {
    assert.equal(toZipPath('file:///cache/backup.zip'), '/cache/backup.zip')
    assert.equal(toZipPath('/cache/backup.zip'), '/cache/backup.zip')
  })
})

describe('isZipFileHead', () => {
  it('detects PK zip magic in base64', () => {
    assert.equal(isZipFileHead('UEs'), true)
    assert.equal(isZipFileHead('abc'), false)
  })
})

describe('isBackupZip', () => {
  it('does not classify octet-stream CSV as ZIP without PK magic', () => {
    assert.equal(isBackupZip('raindrop.csv', 'application/octet-stream', false), false)
    assert.equal(isBackupZip('backup.bin', 'application/octet-stream', true), true)
  })
})

describe('media sentinel helpers', () => {
  it('round-trips trove-media references', () => {
    assert.equal(mediaSentinel('photo.jpg'), `${MEDIA_SCHEME}photo.jpg`)
    assert.equal(parseMediaSentinel(`${MEDIA_SCHEME}photo.jpg`), 'photo.jpg')
    assert.equal(parseMediaSentinel('https://cdn.example/x.jpg'), undefined)
  })

  it('accepts Trove basenames with timestamps, punctuation, and extensions', () => {
    const valid = [
      '1721390400000-photo.jpg',
      'backup_image-01.final.jpeg',
      'thumb_name.v2.png',
    ]
    for (const name of valid) {
      assert.equal(requireSafeMediaBasename(name), name)
      assert.equal(parseMediaSentinel(mediaSentinel(name)), name)
    }
  })

  it('rejects traversal, backslashes, encoded separators, and control chars', () => {
    const unsafe = [
      '../secret.jpg',
      '..\\secret.jpg',
      'folder/secret.jpg',
      'folder\\secret.jpg',
      'folder%2Fsecret.jpg',
      'folder%5Csecret.jpg',
      'folder%252fsecret.jpg',
      '.',
      '..',
      'C:secret.jpg',
      'bad\u0000name.jpg',
      'bad%0Aname.jpg',
    ]
    for (const name of unsafe) {
      assert.throws(() => requireSafeMediaBasename(name), /unsafe media filename/i)
      assert.throws(
        () => parseMediaSentinel(`${MEDIA_SCHEME}${name}`),
        /unsafe media filename/i,
      )
    }
  })

  it('identifies device-local media paths', () => {
    assert.equal(shouldBundleLocalMedia(`${LOCAL}img.jpg`, LOCAL), true)
    assert.equal(shouldBundleLocalMedia('https://x/img.jpg', LOCAL), false)
    assert.equal(shouldBundleLocalMedia(undefined, LOCAL), false)
  })
})

describe('unsafe media restore references', () => {
  it('fails manual merge before the target can construct a media path', async () => {
    let importedMedia = 0
    const target = {
      importCap: Infinity,
      fetchCollections: async () => [],
      createCollection: async () => null,
      createSave: async () => null,
      importMedia: async () => {
        importedMedia++
        return null
      },
      repairMissingThumbnails: async () => 0,
      isLimitError: () => false,
    }

    await assert.rejects(
      mergeBackupRecordsWithTarget(
        {
          collections: [],
          saves: [{
            id: 'save-unsafe',
            user_id: 'source',
            title: 'Unsafe media',
            type: 'image',
            image_url: `${MEDIA_SCHEME}../outside.jpg`,
            tags: [],
            is_inbox: false,
            created_at: '2026-07-19T00:00:00.000Z',
          }],
        },
        'file:///extract/',
        target,
      ),
      /unsafe media filename/i,
    )
    assert.equal(importedMedia, 0)
  })
})

describe('bundleMediaReference', () => {
  it('maps local URIs to sentinels and schedules one copy per filename', () => {
    const bundled = new Set<string>()
    const first = bundleMediaReference(`${LOCAL}a.jpg`, LOCAL, bundled)
    assert.equal(first.exportUri, `${MEDIA_SCHEME}a.jpg`)
    assert.equal(first.copyFrom, `${LOCAL}a.jpg`)
    assert.equal(first.copyName, 'a.jpg')

    bundled.add('a.jpg')
    const second = bundleMediaReference(`${LOCAL}a.jpg`, LOCAL, bundled)
    assert.equal(second.exportUri, `${MEDIA_SCHEME}a.jpg`)
    assert.equal(second.copyFrom, undefined)
  })

  it('passes through remote URLs unchanged', () => {
    const bundled = new Set<string>()
    const remote = bundleMediaReference('https://cdn.example/x.jpg', LOCAL, bundled)
    assert.equal(remote.exportUri, 'https://cdn.example/x.jpg')
    assert.equal(remote.copyFrom, undefined)
  })
})

describe('mapRecordsForExport', () => {
  it('retries a shared local media copy after the first reference fails', async () => {
    let attempts = 0
    const localUri = `${LOCAL}shared.jpg`
    const payload = await mapRecordsForExport(
      [{
        id: 'save-1',
        user_id: 'user-1',
        url: localUri,
        title: 'Shared media',
        type: 'image',
        image_url: localUri,
        tags: [],
        is_inbox: false,
        created_at: '2026-01-01T00:00:00.000Z',
      }],
      [],
      LOCAL,
      async () => {
        attempts++
        if (attempts === 1) throw new Error('copy failed')
      },
      'file:///cache/stage/media/',
    )

    assert.equal(attempts, 2)
    assert.equal(payload.saves[0].url, localUri)
    assert.equal(payload.saves[0].image_url, `${MEDIA_SCHEME}shared.jpg`)
  })
})

describe('cleanupOnFailure', () => {
  it('cleans once when extraction rejects before returning ownership', async () => {
    let cleanupCalls = 0

    await assert.rejects(
      cleanupOnFailure(
        async () => { throw new Error('unzip failed') },
        async () => { cleanupCalls++ },
      ),
      /unzip failed/,
    )

    assert.equal(cleanupCalls, 1)
  })

  it('leaves cleanup ownership with the caller after success', async () => {
    let cleanupCalls = 0
    const result = await cleanupOnFailure(
      async () => 'extracted',
      async () => { cleanupCalls++ },
    )

    assert.equal(result, 'extracted')
    assert.equal(cleanupCalls, 0)
  })
})

describe('buildSaveImportFields', () => {
  it('maps restored save fields including pin, favorite, viewed, and timestamps', () => {
    const fields = buildSaveImportFields(
      {
        title: 'Article',
        description: 'desc',
        type: 'link',
        content: 'body',
        collection_id: 'col-import',
        tags: ['a'],
        is_inbox: false,
        is_favorite: true,
        is_pinned: true,
        is_viewed: false,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      { 'col-import': 'col-local' },
      { url: 'https://example.com', image_url: `${MEDIA_SCHEME}thumb.jpg` },
    )

    assert.deepEqual(fields, {
      url: 'https://example.com',
      title: 'Article',
      description: 'desc',
      type: 'link',
      content: 'body',
      image_url: `${MEDIA_SCHEME}thumb.jpg`,
      collection_id: 'col-local',
      tags: ['a'],
      is_inbox: false,
      is_favorite: true,
      is_pinned: true,
      is_viewed: false,
      created_at: '2026-01-01T00:00:00.000Z',
    })
  })
})

describe('buildCollectionImportFields', () => {
  it('maps cover, pin, and created_at for collection restore', () => {
    const fields = buildCollectionImportFields(
      {
        name: 'Reading',
        icon: 'book-outline',
        color: '#c0613c',
        description: 'Articles',
        is_pinned: true,
        created_at: '2026-02-01T00:00:00.000Z',
      },
      `${MEDIA_SCHEME}cover.jpg`,
    )

    assert.deepEqual(fields, {
      name: 'Reading',
      icon: 'book-outline',
      color: '#c0613c',
      description: 'Articles',
      cover_image_url: `${MEDIA_SCHEME}cover.jpg`,
      is_pinned: true,
      created_at: '2026-02-01T00:00:00.000Z',
    })
  })
})

describe('normalizeBackupPayload', () => {
  it('defaults missing arrays and preserves version metadata shape', () => {
    const normalized = normalizeBackupPayload({
      version: BACKUP_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
    })
    assert.deepEqual(normalized, { saves: [], collections: [] })
  })
})

describe('validateBackupPayloadStructure', () => {
  const validSave = {
    id: 'save-1',
    user_id: 'user-1',
    title: 'Saved article',
    type: 'link',
    tags: ['reading'],
    is_inbox: false,
    created_at: '2026-07-19T00:00:00.000Z',
  }
  const validCollection = {
    id: 'collection-1',
    user_id: 'user-1',
    name: 'Reading',
    icon: 'book-outline',
    color: '#c0613c',
    created_at: '2026-07-18T00:00:00.000Z',
  }

  it('normalizes structurally valid current records', () => {
    const normalized = validateBackupPayloadStructure({
      version: BACKUP_VERSION,
      exportedAt: '2026-07-19T00:00:00.000Z',
      saves: [validSave],
      collections: [validCollection],
    })
    assert.equal(normalized.saves[0].id, 'save-1')
    assert.equal(normalized.collections[0].id, 'collection-1')
  })

  it('rejects unsafe media sentinels during automatic validation', () => {
    assert.throws(
      () => validateBackupPayloadStructure({
        version: BACKUP_VERSION,
        exportedAt: '2026-07-19T00:00:00.000Z',
        saves: [{
          ...validSave,
          image_url: `${MEDIA_SCHEME}folder%2Foutside.jpg`,
        }],
        collections: [],
      }),
      /unsafe media filename/i,
    )
  })

  it('rejects malformed or unsupported backup payloads', () => {
    assert.throws(() => validateBackupPayloadStructure(null), /valid Trove backup/)
    assert.throws(
      () => validateBackupPayloadStructure({ version: BACKUP_VERSION, saves: {}, collections: [] }),
      /valid Trove backup/,
    )
    assert.throws(
      () => validateBackupPayloadStructure({
        version: 999,
        exportedAt: '2026-07-19T00:00:00.000Z',
        saves: [],
        collections: [],
      }),
      /unsupported backup version/i,
    )
  })

  it('rejects null or malformed save records', () => {
    const invalidSaves = [
      null,
      { ...validSave, id: '' },
      { ...validSave, title: '  ' },
      { ...validSave, type: 'document' },
      { ...validSave, tags: null },
      { ...validSave, tags: ['ok', 7] },
      { ...validSave, created_at: 'not-a-date' },
    ]

    for (const save of invalidSaves) {
      assert.throws(
        () => validateBackupPayloadStructure({
          version: BACKUP_VERSION,
          exportedAt: '2026-07-19T00:00:00.000Z',
          saves: [save],
          collections: [],
        }),
        /invalid save record/i,
      )
    }
  })

  it('rejects null or malformed collection records', () => {
    const invalidCollections = [
      null,
      { ...validCollection, id: '' },
      { ...validCollection, name: '  ' },
      { ...validCollection, created_at: 'not-a-date' },
    ]

    for (const collection of invalidCollections) {
      assert.throws(
        () => validateBackupPayloadStructure({
          version: BACKUP_VERSION,
          exportedAt: '2026-07-19T00:00:00.000Z',
          saves: [],
          collections: [collection],
        }),
        /invalid collection record/i,
      )
    }
  })
})
