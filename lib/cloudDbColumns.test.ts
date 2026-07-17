import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMissingViewedColumn } from './cloudDbColumns'

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
