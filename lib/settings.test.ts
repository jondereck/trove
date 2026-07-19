import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

const store = new Map<string, string>()

describe('patchSettings', () => {
  beforeEach(async () => {
    store.clear()
    const { __resetSecureStoreForTests } = await import('./settings')
    __resetSecureStoreForTests({
      getItemAsync: async (key: string) => store.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        store.set(key, value)
      },
    })
  })

  it('persists merged settings and returns them', async () => {
    const { patchSettings, getSettings } = await import('./settings')
    const next = await patchSettings({ autoBackupEnabled: false })
    assert.equal(next.autoBackupEnabled, false)
    const loaded = await getSettings()
    assert.equal(loaded.autoBackupEnabled, false)
  })

  it('throws when persistence fails so callers can avoid false success', async () => {
    const { __resetSecureStoreForTests, patchSettings, getSettings } = await import('./settings')
    __resetSecureStoreForTests({
      getItemAsync: async (key: string) => store.get(key) ?? null,
      setItemAsync: async () => {
        throw new Error('disk full')
      },
    })
    const before = await getSettings()
    await assert.rejects(
      () => patchSettings({ autoBackupEnabled: !before.autoBackupEnabled }),
      /disk full/,
    )
    const after = await getSettings()
    assert.equal(after.autoBackupEnabled, before.autoBackupEnabled)
  })
})
