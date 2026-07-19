import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countUnreadLibrarySaves } from './unreadCount'
import type { Save } from '../types'

function save(partial: Partial<Save> & Pick<Save, 'id' | 'title'>): Save {
  return {
    type: 'link',
    tags: [],
    is_inbox: false,
    created_at: '2026-07-01T00:00:00.000Z',
    is_viewed: false,
    ...partial,
  } as Save
}

describe('countUnreadLibrarySaves', () => {
  it('counts only is_viewed === false', () => {
    const n = countUnreadLibrarySaves([
      save({ id: '1', title: 'a', is_viewed: false }),
      save({ id: '2', title: 'b', is_viewed: true }),
      save({ id: '3', title: 'c', is_viewed: undefined }),
    ])
    assert.equal(n, 1)
  })
})
