import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeNotificationEntries, MAX_LOG_ENTRIES } from './notificationLogCore'

const entry = (id: string, date: string, read = false) => ({
  id,
  title: 'Trove Inbox',
  body: 'You have 3 unsorted items',
  date,
  read,
})

describe('mergeNotificationEntries', () => {
  it('prepends new entries sorted newest first', () => {
    const merged = mergeNotificationEntries(
      [entry('a', '2026-07-16T10:00:00.000Z', true)],
      [entry('b', '2026-07-17T09:00:00.000Z')],
    )
    assert.deepEqual(merged.map(e => e.id), ['b', 'a'])
    assert.equal(merged[0].read, false)
    assert.equal(merged[1].read, true)
  })

  it('dedupes by id and keeps the existing read state', () => {
    const merged = mergeNotificationEntries(
      [entry('a', '2026-07-16T10:00:00.000Z', true)],
      [entry('a', '2026-07-16T10:00:00.000Z')],
    )
    assert.equal(merged.length, 1)
    assert.equal(merged[0].read, true)
  })

  it('caps the log at MAX_LOG_ENTRIES newest entries', () => {
    const existing = Array.from({ length: MAX_LOG_ENTRIES }, (_, i) =>
      entry(`old-${i}`, new Date(2026, 0, 1, 0, i).toISOString()),
    )
    const merged = mergeNotificationEntries(existing, [entry('new', '2026-07-17T09:00:00.000Z')])
    assert.equal(merged.length, MAX_LOG_ENTRIES)
    assert.equal(merged[0].id, 'new')
    assert.equal(merged.some(e => e.id === 'old-0'), false)
  })
})
