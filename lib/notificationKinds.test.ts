import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildInboxDigestContent,
  buildUnreadDigestContent,
  shouldScheduleCountDigest,
} from './notificationKinds'

describe('shouldScheduleCountDigest', () => {
  it('schedules only when enabled and count > 0', () => {
    assert.equal(shouldScheduleCountDigest(true, 3), true)
    assert.equal(shouldScheduleCountDigest(true, 0), false)
    assert.equal(shouldScheduleCountDigest(false, 5), false)
  })
})

describe('buildUnreadDigestContent', () => {
  it('uses singular copy and library-unread deep link', () => {
    const c = buildUnreadDigestContent(1)
    assert.equal(c.title, 'New in Trove')
    assert.equal(c.body, 'You have 1 new save to open')
    assert.deepEqual(c.data, { screen: 'library-unread' })
  })

  it('uses plural copy', () => {
    assert.equal(buildUnreadDigestContent(4).body, 'You have 4 new saves to open')
  })
})

describe('buildInboxDigestContent', () => {
  it('keeps unsorted wording and inbox deep link', () => {
    const c = buildInboxDigestContent(2)
    assert.equal(c.title, 'Trove Inbox')
    assert.equal(c.body, 'You have 2 unsorted items')
    assert.deepEqual(c.data, { screen: 'inbox' })
  })
})
