import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { partitionPinned } from './pinnedSections'

describe('partitionPinned', () => {
  it('separates pinned items while preserving group order', () => {
    const items = [
      { id: 'pinned-newer', is_pinned: true },
      { id: 'pinned-older', is_pinned: true },
      { id: 'regular-newer', is_pinned: false },
      { id: 'regular-older' },
    ]

    assert.deepEqual(partitionPinned(items), {
      pinned: [items[0], items[1]],
      unpinned: [items[2], items[3]],
    })
  })

  it('treats missing and false pin values as unpinned', () => {
    const items = [
      { id: 'missing' },
      { id: 'false', is_pinned: false },
      { id: 'pinned', is_pinned: true },
    ]

    assert.deepEqual(partitionPinned(items), {
      pinned: [items[2]],
      unpinned: [items[0], items[1]],
    })
  })
})
