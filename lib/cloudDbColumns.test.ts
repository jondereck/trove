import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bindExpectedUserId,
  isMissingViewedColumn,
  stripMissingOptionalColumn,
} from './cloudDbColumns'

describe('bindExpectedUserId', () => {
  it('forces inserts to the captured user id', () => {
    assert.deepEqual(
      bindExpectedUserId(
        { title: 'Saved', user_id: 'current-session-user' },
        'captured-user',
      ),
      { title: 'Saved', user_id: 'captured-user' },
    )
  })
})

describe('isMissingViewedColumn', () => {
  it('recognizes PostgREST missing-column errors', () => {
    assert.equal(
      isMissingViewedColumn({ message: "column saves.is_viewed does not exist" }),
      true,
    )
    assert.equal(
      isMissingViewedColumn({ code: 'PGRST204', message: "Could not find the 'is_viewed' column" }),
      true,
    )
  })

  it('does not hide unrelated database failures', () => {
    assert.equal(isMissingViewedColumn({ code: '42501', message: 'permission denied' }), false)
    assert.equal(isMissingViewedColumn({ message: '' }), false)
  })
})

describe('stripMissingOptionalColumn', () => {
  const startingPayload = {
    title: 'Saved article',
    is_viewed: false,
    is_pinned: true,
  }

  it('strips viewed then pinned when errors arrive in that order', () => {
    const afterViewed = stripMissingOptionalColumn(
      startingPayload,
      { message: "column saves.is_viewed does not exist" },
    )
    assert.deepEqual(afterViewed, { title: 'Saved article', is_pinned: true })

    const afterPinned = stripMissingOptionalColumn(
      afterViewed!,
      { message: "column saves.is_pinned does not exist" },
    )
    assert.deepEqual(afterPinned, { title: 'Saved article' })
  })

  it('strips pinned then viewed when errors arrive in that order', () => {
    const afterPinned = stripMissingOptionalColumn(
      startingPayload,
      { message: "column saves.is_pinned does not exist" },
    )
    assert.deepEqual(afterPinned, { title: 'Saved article', is_viewed: false })

    const afterViewed = stripMissingOptionalColumn(
      afterPinned!,
      { message: "column saves.is_viewed does not exist" },
    )
    assert.deepEqual(afterViewed, { title: 'Saved article' })
  })

  it('does not retry unrelated errors', () => {
    assert.equal(
      stripMissingOptionalColumn(startingPayload, {
        code: '42501',
        message: 'permission denied',
      }),
      null,
    )
  })
})
