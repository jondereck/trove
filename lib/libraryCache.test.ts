import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

const store = new Map<string, string>()

describe('libraryCache', () => {
  beforeEach(() => {
    store.clear()
  })

  it('peek returns null before cache', async () => {
    const { peekLibraryCache, __resetForTests } = await import('./libraryCache')
    __resetForTests(store)
    assert.equal(peekLibraryCache(), null)
  })

  it('round-trips a snapshot', async () => {
    const {
      cacheLibrarySnapshot,
      loadLibraryCache,
      clearLibraryCache,
      __resetForTests,
    } = await import('./libraryCache')
    __resetForTests(store)

    const snapshot = {
      saves: [{
        id: '1',
        user_id: 'user-1',
        title: 'Test',
        type: 'link' as const,
        tags: [],
        is_inbox: false,
        created_at: '2026-01-01',
      }],
      libraryTotal: 1,
      filteredTotal: 1,
      inboxSaves: [],
      collections: [],
      filter: 'all' as const,
      cachedAt: new Date().toISOString(),
    }

    await cacheLibrarySnapshot(snapshot)
    const loaded = await loadLibraryCache()
    assert.equal(loaded?.saves[0].id, '1')
    await clearLibraryCache()
    assert.equal(await loadLibraryCache(), null)
  })
})
