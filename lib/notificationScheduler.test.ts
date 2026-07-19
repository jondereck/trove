import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decideScheduleDigest } from './notificationScheduler'

describe('decideScheduleDigest', () => {
  it('skips when disabled or empty', () => {
    assert.equal(decideScheduleDigest({ enabled: false, count: 9 }), 'skip')
    assert.equal(decideScheduleDigest({ enabled: true, count: 0 }), 'skip')
  })
  it('schedules when enabled with items', () => {
    assert.equal(decideScheduleDigest({ enabled: true, count: 2 }), 'schedule')
  })
})
