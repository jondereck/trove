import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { deferMarkSaveViewed, nextIsUnreadAfterPersist } from './saveViewed'

describe('nextIsUnreadAfterPersist', () => {
  it('clears unread only when persist succeeds', () => {
    assert.equal(nextIsUnreadAfterPersist(true, true), false)
    assert.equal(nextIsUnreadAfterPersist(true, false), true)
  })

  it('keeps read saves read regardless of persist result', () => {
    assert.equal(nextIsUnreadAfterPersist(false, true), false)
    assert.equal(nextIsUnreadAfterPersist(false, false), false)
  })
})

describe('deferMarkSaveViewed', () => {
  it('runs persist after interactions and updates local state only on success', async () => {
    let interactionsDone = false
    let persisted = false
    let localUpdated = false

    deferMarkSaveViewed({
      isUnread: true,
      saveId: 'save-1',
      markViewed: async (id) => {
        assert.equal(id, 'save-1')
        persisted = true
        return true
      },
      runAfterInteractions: (task) => {
        interactionsDone = true
        task()
        return { cancel: () => {} }
      },
      onPersisted: () => { localUpdated = true },
      isMounted: () => true,
    })

    await new Promise<void>((resolve) => { queueMicrotask(() => queueMicrotask(resolve)) })

    assert.equal(interactionsDone, true)
    assert.equal(persisted, true)
    assert.equal(localUpdated, true)
  })

  it('persists after interactions but skips local update when persist fails', async () => {
    let persisted = false
    let localUpdated = false

    deferMarkSaveViewed({
      isUnread: true,
      saveId: 'save-1',
      markViewed: async () => {
        persisted = true
        return false
      },
      runAfterInteractions: (task) => {
        task()
        return { cancel: () => {} }
      },
      onPersisted: () => { localUpdated = true },
      isMounted: () => true,
    })

    await new Promise<void>((resolve) => { queueMicrotask(() => queueMicrotask(resolve)) })

    assert.equal(persisted, true)
    assert.equal(localUpdated, false)
  })

  it('persists after interactions even when unmounted but skips local update', async () => {
    let persisted = false
    let localUpdated = false

    deferMarkSaveViewed({
      isUnread: true,
      saveId: 'save-1',
      markViewed: async () => {
        persisted = true
        return true
      },
      runAfterInteractions: (task) => {
        task()
        return { cancel: () => {} }
      },
      onPersisted: () => { localUpdated = true },
      isMounted: () => false,
    })

    await new Promise<void>((resolve) => { queueMicrotask(() => queueMicrotask(resolve)) })

    assert.equal(persisted, true)
    assert.equal(localUpdated, false)
  })

  it('does nothing when save is already viewed', () => {
    let called = false

    deferMarkSaveViewed({
      isUnread: false,
      saveId: 'save-1',
      markViewed: async () => {
        called = true
        return true
      },
      runAfterInteractions: () => {
        throw new Error('should not schedule')
      },
      onPersisted: () => { called = true },
    })

    assert.equal(called, false)
  })
})
